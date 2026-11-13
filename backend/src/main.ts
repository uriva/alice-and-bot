// deno-lint-ignore-file
import { id } from "@instantdb/admin";
import { apiHandler } from "typed-api";
import type { PushSubscriptionJSON } from "../../instant.schema.ts";
import { isValidAlias, normalizeAlias } from "../../protocol/src/alias.ts";
import {
  shortIdFromPublicSignKey,
  shortIdLength,
} from "../../protocol/src/shortId.ts";
import type { EncryptedMessage } from "../../protocol/src/clientApi.ts";
import type { EncryptedSymmetric } from "../../protocol/src/crypto.ts";
import { type BackendApiImpl, backendApiSchema } from "./api.ts";
import { issueNonceHelper, verifyAuthToken } from "./auth.ts";
import {
  chooseOptimalParticipantKey,
  conversationHasExactParticipants,
} from "./conversationParticipants.ts";
import { createConversation } from "./createConversation.ts";
import { auth, query, transact, tx } from "./db.ts";
import {
  callWebhooks,
  fetchWebhookConversation,
  getVapidPublicKey,
  sendPushToParticipants,
} from "./notificationService.ts";
import { isSafeWebhookUrl } from "./ssrfGuard.ts";
import { generateUploadUrl } from "./storage.ts";
import { handleUiUpdate } from "./uiUpdate.ts";
import { withWalletLock } from "./walletLock.ts";
import { timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import {
  deriveBtcAddress,
  getAddressTransactions,
  getBtcPriceUsd,
  receivedSatoshis,
} from "@uri/crypto-utils";

const createIdentityForAccount = async (
  { publicSignKey, publicEncryptKey, account }: {
    publicSignKey: string;
    publicEncryptKey: string;
    account: string;
  },
): Promise<{ success: true }> => {
  await transact(
    tx.identities[id()]
      .update({
        publicSignKey,
        publicEncryptKey,
        shortId: await shortIdFromPublicSignKey(publicSignKey),
      })
      .link({ account }),
  );
  return { success: true };
};

const TRANSFER_TTL_MS = 5 * 60 * 1000;
const MAX_TRANSFER_PAYLOAD_CHARS = 32_768;
const MAX_TRANSFER_ENTRIES = 1_000;

const identityPublicSignKeyBy = (
  where: { publicSignKey: string } | { alias: string } | { shortId: string },
) =>
  query({ identities: { $: { where } } }).then(
    ({ identities }) => identities[0]?.publicSignKey,
  );

const firstDefined = async (
  lookups: (() => Promise<string | undefined>)[],
): Promise<string | undefined> =>
  lookups.length === 0
    ? undefined
    : (await lookups[0]()) ?? firstDefined(lookups.slice(1));

const handleLookups = (handle: string) => {
  const alias = normalizeAlias(handle);
  return [
    () => identityPublicSignKeyBy({ publicSignKey: handle }),
    ...(isValidAlias(alias) ? [() => identityPublicSignKeyBy({ alias })] : []),
    ...(handle.length === shortIdLength
      ? [() => identityPublicSignKeyBy({ shortId: handle })]
      : []),
  ];
};

const transferPayloads = new Map<
  string,
  { encryptedPayload: string; expiresAt: number }
>();

let activeWaitUntil: ((promise: Promise<unknown>) => void) | undefined;

export const setRequestWaitUntil = (
  fn: ((promise: Promise<unknown>) => void) | undefined,
) => {
  activeWaitUntil = fn;
};

const registerBackgroundTask = (promise: Promise<unknown>) => {
  const safe = promise.catch((e) => console.error("background task failed", e));
  if (activeWaitUntil) {
    activeWaitUntil(safe);
  }
};

export const endpoints: BackendApiImpl = {
  authenticate: (token: string) => auth.verifyToken(token),
  handlers: {
    conversationKey: async ({ conversationId, publicSignKey }) => {
      const { identities } = await query({
        identities: {
          $: { where: { publicSignKey } },
          keys: {
            $: { where: { conversation: conversationId } },
          },
        },
      });
      const keys = identities[0]?.keys ?? [];
      return (keys.length === 0)
        ? { error: "no-such-key" }
        : { conversationKey: keys[0].key };
    },
    createConversation,
    sendMessage: async (
      { encryptedMessage, conversation, silent, senderPublicSignKey },
    ) => {
      console.log(
        "[DEBUG sendMessage] received for conversation",
        conversation,
      );
      const convResult = await fetchWebhookConversation(conversation);
      if (convResult.conversations.length === 0) {
        throw new Error("Conversation not found");
      }
      if (senderPublicSignKey !== undefined) {
        const isParticipant = convResult.conversations[0].participants.some(
          (p: { publicSignKey: string }) =>
            p.publicSignKey === senderPublicSignKey,
        );
        if (!isParticipant) {
          throw new Error("Not a participant");
        }
      }
      const messageId = id();
      const timestamp = Date.now();
      const prefetchedConversations = Promise.resolve(convResult);
      // Persist the message first; do not block on side effects (webhooks/push)
      await transact([
        tx.messages[messageId]
          .update({
            payload: encryptedMessage as EncryptedMessage,
            timestamp,
          }).link({
            conversation,
          }),
        tx.conversations[conversation].update({ updatedAt: timestamp }),
      ]);
      // Fire-and-forget side effects outside request tracing context
      const dispatchPromise = new Promise<void>((resolve) => {
        setTimeout(() => {
          Promise.all([
            callWebhooks({
              messageId,
              conversationId: conversation,
              payload: encryptedMessage as EncryptedMessage,
              timestamp,
              storeLocalRelay: relayStoreMessage,
              prefetchedConversations,
            }).catch((e) => console.error("webhook dispatch failed", e)),
            ...(silent !== true
              ? [
                sendPushToParticipants({
                  messageId,
                  conversationId: conversation,
                  timestamp,
                  senderPublicSignKey,
                }).catch((e) => console.error("push dispatch failed", e)),
              ]
              : []),
          ]).then(() => resolve());
        }, 0);
      });
      registerBackgroundTask(dispatchPromise);
      return { messageId };
    },
    sendTyping: async ({ conversation, isTyping, publicSignKey }) => {
      // Validate conversation & participant membership and fetch existing typingState in one query
      const { conversations, identities, typingStates } = await query({
        conversations: {
          participants: {},
          $: { where: { id: conversation } },
        },
        identities: { $: { where: { publicSignKey } } },
        typingStates: {
          $: { where: { "owner.publicSignKey": publicSignKey, conversation } },
        },
      });
      if (conversations.length === 0 || identities.length === 0) {
        return { success: true };
      }
      const isParticipant = conversations[0].participants.some(
        (p: { publicSignKey: string }) => p.publicSignKey === publicSignKey,
      );
      if (!isParticipant) {
        return { success: true };
      }
      const identityId = identities[0].id;
      await transact(
        tx.typingStates[typingStates.length > 0 ? typingStates[0].id : id()]
          .update({ updatedAt: isTyping ? Date.now() : 0 })
          .link({ owner: identityId, conversation }),
      );
      // Opportunistic cleanup: occasionally prune stale typingStates for this conversation
      if (Math.random() < 0.15) {
        registerBackgroundTask(
          (async () => {
            const now = Date.now();
            const { typingStates: allStates } = await query({
              typingStates: { $: { where: { conversation } } },
            });
            const stale = allStates.filter(
              (t: { id: string; updatedAt: number }) =>
                t.updatedAt === 0 || now - t.updatedAt > 20_000,
            );
            await Promise.all(
              stale.map((t: { id: string }) =>
                transact(tx.typingStates[t.id].delete())
              ),
            );
          })(),
        );
      }
      return { success: true };
    },
    createAccount: async () => {
      const accountId = id();
      const accessToken = crypto.randomUUID();
      await transact(tx.accounts[accountId].update({ accessToken }));
      return { success: true, accountId, accessToken };
    },
    createAnonymousIdentity: async (
      { name, publicSignKey, publicEncryptKey, alias },
    ) => {
      let finalAlias: string | undefined = undefined;
      if (alias) {
        const normalized = normalizeAlias(alias);
        if (isValidAlias(normalized)) {
          // ensure not taken
          const { identities: taken } = await query({
            identities: { $: { where: { alias: normalized } } },
          });
          if (taken.length === 0) finalAlias = normalized;
        }
      }
      await transact(
        tx.identities[id()].update({
          name,
          publicSignKey,
          publicEncryptKey,
          shortId: await shortIdFromPublicSignKey(publicSignKey),
          ...(finalAlias ? { alias: finalAlias } : {}),
        }),
      );
      return {};
    },
    createIdentity: async ({ email }, { publicSignKey, publicEncryptKey }) => {
      if (!email) {
        return { success: false, error: "cannot-associate-to-guest-account" };
      }
      const { accounts } = await query({
        accounts: { $: { where: { email } } },
      });
      await createIdentityForAccount({
        publicSignKey,
        publicEncryptKey,
        account: accounts[0].id,
      });
      return { success: true };
    },
    setWebhook: async ({ url, publicSignKey, auth }) => {
      if (auth !== undefined) {
        const authOk = await verifyAuthToken({
          action: "setWebhook",
          payload: { url },
          publicSignKey,
          nonce: auth.nonce,
          authToken: auth.authToken,
        });
        if (!authOk) {
          return { success: false, error: "invalid-auth" as const };
        }
      }
      if (!isSafeWebhookUrl(url, { allowEmpty: true })) {
        return { success: false, error: "invalid-url" as const };
      }
      const { identities } = await query({
        identities: { $: { where: { publicSignKey } } },
      });
      if (identities.length === 0) {
        return {
          success: false,
          error: "identity-does-not-exist" as const,
        };
      }
      const identity = identities[0];
      if (!auth) {
        if (url === "" || (identity.webhook && identity.webhook !== url)) {
          return { success: false, error: "invalid-auth" as const };
        }
      }
      await transact(tx.identities[identity.id].update({ webhook: url }));
      return { success: true };
    },
    getProfile: async ({ publicSignKey }) => {
      const { identities } = await query({
        identities: { $: { where: { publicSignKey } } },
      });
      if (identities.length === 0) return { profile: null };
      const { name, avatar, alias, priceTag } = identities[0];
      return { profile: { name, avatar, alias, priceTag } };
    },
    getConversations: async ({ publicSignKeys }) => {
      if (publicSignKeys.length === 0) return { conversations: [] };
      const { identities } = await query({
        identities: {
          $: { where: { publicSignKey: { $in: publicSignKeys } } },
        },
      });
      const chosenKey = chooseOptimalParticipantKey(
        publicSignKeys,
        identities,
      );
      if (!chosenKey) return { conversations: [] };
      const { conversations } = await query({
        conversations: {
          participants: {},
          $: {
            where: { "participants.publicSignKey": chosenKey },
          },
        },
      });
      return {
        conversations: conversations.filter(
          conversationHasExactParticipants(publicSignKeys),
        ),
      };
    },
    getConversationInfo: async ({ conversationId }) => {
      const { conversations } = await query({
        conversations: {
          participants: {},
          canvas: {},
          $: { where: { id: conversationId } },
        },
      });
      if (!conversations.length) return { error: "not-found" };
      const limited = conversations[0].participants.slice(0, 10);
      const { identities } = await query({
        identities: {
          $: {
            where: {
              publicSignKey: {
                $in: limited.map(({ publicSignKey }) => publicSignKey),
              },
            },
          },
        },
      });
      const pkToIdentity = Object.fromEntries(
        identities.map((
          i: {
            publicSignKey: string;
            name?: string;
            avatar?: string;
            alias?: string;
          },
        ) => [i.publicSignKey, i]),
      );
      return {
        conversationInfo: {
          participants: limited.map(
            ({ publicSignKey }: { publicSignKey: string }) => {
              const { name, avatar, alias } = pkToIdentity[publicSignKey];
              return { publicSignKey, name, avatar, alias };
            },
          ),
          isPartial: conversations[0].participants.length > limited.length,
          hasCanvas: Boolean(
            conversations[0].canvas &&
              (Array.isArray(conversations[0].canvas)
                ? conversations[0].canvas.length > 0
                : true),
          ),
        },
      };
    },
    issueNonce: async ({ publicSignKey }) => ({
      nonce: await issueNonceHelper(publicSignKey),
    }),
    aliasToPublicSignKey: async ({ alias }) => {
      const { identities } = await query({
        identities: { $: { where: { alias: normalizeAlias(alias) } } },
      });
      if (identities.length === 0) return { error: "no-such-alias" };
      return { publicSignKey: identities[0].publicSignKey };
    },
    resolveHandle: async ({ handle }) => {
      const stripped = handle.trim().replace(/^@/, "");
      const publicSignKey = await firstDefined(handleLookups(stripped));
      return publicSignKey
        ? { publicSignKey }
        : { error: "no-such-handle" as const };
    },
    publicSignKeyToAlias: async ({ publicSignKey }) => {
      const { identities } = await query({
        identities: { $: { where: { publicSignKey } } },
      });
      if (identities.length === 0) return { error: "no-such-identity" };
      const alias = identities[0].alias;
      if (!alias) return { error: "no-alias" };
      return { alias };
    },
    setAlias: async ({ payload, publicSignKey, nonce, authToken }) => {
      const authOk = await verifyAuthToken({
        action: "setAlias",
        payload,
        publicSignKey,
        nonce,
        authToken,
      });
      const { alias } = payload;
      if (!isValidAlias(alias)) {
        return { success: false, error: "invalid-alias" };
      }
      const { identities: identityMatches } = await query({
        identities: { wallet: {}, $: { where: { publicSignKey } } },
      });
      if (identityMatches.length === 0) {
        return { success: false, error: "not-found" };
      }
      if (!authOk) return { success: false, error: "invalid-auth" };
      const { identities: taken } = await query({
        identities: { $: { where: { alias } } },
      });
      if (taken.length > 0 && taken[0].id !== identityMatches[0].id) {
        return { success: false, error: "alias-taken" };
      }
      await transact(
        tx.identities[identityMatches[0].id].update({ alias }),
      );
      return { success: true };
    },
    setName: async ({ payload, publicSignKey, nonce, authToken }) => {
      const authOk = await verifyAuthToken({
        action: "setName",
        payload,
        publicSignKey,
        nonce,
        authToken,
      });
      const { name } = payload;
      const trimmed = name.trim();
      if (trimmed.length === 0 || trimmed.length > 50) {
        return { success: false, error: "invalid-name" };
      }
      const { identities: identityMatches } = await query({
        identities: {
          wallet: {},
          conversations: {},
          $: { where: { publicSignKey } },
        },
      });
      if (identityMatches.length === 0) {
        return { success: false, error: "not-found" };
      }
      if (!authOk) return { success: false, error: "invalid-auth" };
      const oldName = identityMatches[0].name;
      const convUpdates = oldName && oldName !== trimmed
        ? (identityMatches[0].conversations ?? [])
          .filter((c: { title: string }) => c.title === oldName)
          .map((c: { id: string }) =>
            tx.conversations[c.id].update({ title: trimmed })
          )
        : [];
      await transact([
        tx.identities[identityMatches[0].id].update({ name: trimmed }),
        ...convUpdates,
      ]);
      return { success: true };
    },
    setAvatar: async ({ payload, publicSignKey, nonce, authToken }) => {
      const authOk = await verifyAuthToken({
        action: "setAvatar",
        payload,
        publicSignKey,
        nonce,
        authToken,
      });
      const avatar = payload.avatar?.trim() || undefined;
      if (avatar && avatar.length > 2048) {
        return { success: false, error: "invalid-avatar" };
      }
      const { identities: identityMatches } = await query({
        identities: { wallet: {}, $: { where: { publicSignKey } } },
      });
      if (identityMatches.length === 0) {
        return { success: false, error: "not-found" };
      }
      if (!authOk) return { success: false, error: "invalid-auth" };
      await transact(
        tx.identities[identityMatches[0].id].update({ avatar }),
      );
      return { success: true };
    },
    setPriceTag: async ({ payload, publicSignKey, nonce, authToken }) => {
      const { priceTag } = payload;
      if (
        priceTag !== undefined &&
        (!Number.isFinite(priceTag) || priceTag < 0)
      ) {
        throw new Error("Invalid priceTag");
      }
      const authOk = await verifyAuthToken({
        action: "setPriceTag",
        payload,
        publicSignKey,
        nonce,
        authToken,
      });
      if (!authOk) return { success: false, error: "invalid-auth" };
      const { identities: identityMatches } = await query({
        identities: { wallet: {}, $: { where: { publicSignKey } } },
      });
      if (identityMatches.length === 0) {
        return { success: false, error: "not-found" };
      }
      await transact(
        tx.identities[identityMatches[0].id].update({ priceTag }),
      );
      return { success: true };
    },
    getBalanceAndTransactions: async (
      { payload, publicSignKey, nonce, authToken },
    ) => {
      const authOk = await verifyAuthToken({
        action: "getBalanceAndTransactions",
        payload,
        publicSignKey,
        nonce,
        authToken,
      });
      if (!authOk) return { error: "invalid-auth" };
      const { identities: identityMatches } = await query({
        identities: {
          wallet: {},
          $: { where: { publicSignKey } },
          receivedTransactions: {},
          sentTransactions: {},
        },
      });
      if (identityMatches.length === 0) {
        return { error: "not-found" };
      }
      const identity = identityMatches[0];
      const transactions = [
        ...(identity.receivedTransactions || []),
        ...(identity.sentTransactions || []),
      ].sort((a: any, b: any) => b.timestamp - a.timestamp);
      return {
        balance: identity.wallet?.balance || 0,
        transactions,
      };
    },
    requestPayout: async ({ payload, publicSignKey, nonce, authToken }) => {
      const { amount, walletAddress } = payload;
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Invalid amount");
      }
      const authOk = await verifyAuthToken({
        action: "requestPayout",
        payload,
        publicSignKey,
        nonce,
        authToken,
      });
      if (!authOk) return { success: false, error: "invalid-auth" };

      return withWalletLock(publicSignKey, async () => {
        const { identities: identityMatches } = await query({
          identities: { wallet: {}, $: { where: { publicSignKey } } },
        });
        if (identityMatches.length === 0) {
          return { success: false, error: "not-found" as const };
        }

        const identity = identityMatches[0];
        const currentBalance = identity.wallet?.balance || 0;

        if (currentBalance < amount) {
          return { success: false, error: "insufficient-balance" as const };
        }

        await transact([
          tx.wallets[identity.wallet?.id || id()].update({
            balance: currentBalance - amount,
          }).link({ identity: identity.id }),
          tx.transactions[id()].update({
            amount,
            type: "payout",
            timestamp: Date.now(),
            status: "pending",
            walletAddress,
          }).link({ sender: identity.id }),
        ]);
        return { success: true as const };
      });
    },
    prepareCryptoPayment: async (
      { payload, publicSignKey, nonce, authToken },
    ) => {
      const amount = payload.amount;
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Invalid amount");
      }
      const authOk = await verifyAuthToken({
        action: "prepareCryptoPayment",
        payload,
        publicSignKey,
        nonce,
        authToken,
      });
      if (!authOk) return { error: "invalid-auth" };

      const xpub = Deno.env.get("BITCOIN_XPUB");
      if (!xpub) return { error: "missing-secret" };

      const { identities: identityMatches } = await query({
        identities: { $: { where: { publicSignKey } } },
      });
      if (identityMatches.length === 0) return { error: "not-found" };

      const identityId = identityMatches[0].id;

      return withWalletLock("__crypto_payment_index__", async () => {
        const { cryptoPayments: existingPayments } = await query({
          cryptoPayments: {},
        });
        const index = existingPayments.reduce(
          (max, p) => Math.max(max, (p.index ?? -1) + 1),
          0,
        );

        const address = deriveBtcAddress(xpub, index);
        const btcPrice = await getBtcPriceUsd();
        const btcAmount = Number((amount / btcPrice).toFixed(8));

        await transact(
          tx.cryptoPayments[id()].update({
            address,
            identityId,
            publicSignKey,
            usdAmount: amount,
            index,
            btcAmount,
            createdAt: Date.now(),
          }),
        );

        const bitcoinUri = `bitcoin:${address}?amount=${btcAmount}`;
        const qrUrl =
          `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${
            encodeURIComponent(bitcoinUri)
          }`;

        return { address, btcAmount, usdAmount: amount, qrUrl };
      });
    },
    checkCryptoPayment: async (
      { payload, publicSignKey, nonce, authToken },
    ) => {
      const authOk = await verifyAuthToken({
        action: "checkCryptoPayment",
        payload,
        publicSignKey,
        nonce,
        authToken,
      });
      if (!authOk) return { success: false, error: "invalid-auth" };

      const xpub = Deno.env.get("BITCOIN_XPUB");
      if (!xpub) return { success: false, error: "missing-secret" };

      return withWalletLock(publicSignKey, async () => {
        const { paymentAddress } = payload;
        const { cryptoPayments } = await query({
          cryptoPayments: { $: { where: { address: paymentAddress } } },
        });
        const addressData = cryptoPayments[0];
        if (!addressData) {
          return { success: false, error: "not-found" as const };
        }
        if (addressData.publicSignKey !== publicSignKey) {
          return { success: false, error: "invalid-auth" as const };
        }

        if (addressData.claimedTxid) {
          return { success: false, error: "already-claimed" as const };
        }

        const txs = await getAddressTransactions(paymentAddress);
        for (const t of txs) {
          const satoshis = receivedSatoshis(t, paymentAddress);
          if (satoshis <= 0) continue;

          const btcPrice = await getBtcPriceUsd();
          const btcAmount = satoshis / 1e8;
          const usdAmount = Math.round(btcAmount * btcPrice * 100) / 100;

          await transact(
            tx.cryptoPayments[addressData.id].update({ claimedTxid: t.txid }),
          );

          const { identities: identityMatches } = await query({
            identities: {
              wallet: {},
              $: { where: { id: addressData.identityId } },
            },
          });

          if (identityMatches.length > 0) {
            const identity = identityMatches[0];
            const currentBalance = identity.wallet?.balance || 0;
            await transact([
              tx.wallets[identity.wallet?.id || id()].update({
                balance: currentBalance + usdAmount,
              }).link({ identity: identity.id }),
              tx.transactions[id()].update({
                amount: usdAmount,
                type: "deposit",
                timestamp: Date.now(),
                status: "completed",
                walletAddress: t.txid,
              }).link({ receiver: identity.id }),
            ]);
          }

          return {
            success: true as const,
            message: `Successfully verified and credited $${usdAmount}`,
          };
        }

        return { success: false, error: "not-paid" as const };
      });
    },
    renameConversation: async (
      { payload, publicSignKey, nonce, authToken },
    ) => {
      const authOk = await verifyAuthToken({
        action: "renameConversation",
        payload,
        publicSignKey,
        nonce,
        authToken,
      });
      if (!authOk) return { success: false, error: "invalid-auth" };
      const { conversationId, title } = payload;
      const trimmed = title.trim();
      if (trimmed.length === 0 || trimmed.length > 100) {
        return { success: false, error: "invalid-title" };
      }
      const { conversations } = await query({
        conversations: {
          admins: {},
          participants: {},
          $: { where: { id: conversationId } },
        },
      });
      if (conversations.length === 0) {
        return { success: false, error: "not-found" };
      }
      const isAdmin = conversations[0].admins.length > 0
        ? conversations[0].admins.some(
          (a: { publicSignKey: string }) => a.publicSignKey === publicSignKey,
        )
        : conversations[0].participants.some(
          (p: { publicSignKey: string }) => p.publicSignKey === publicSignKey,
        );
      if (!isAdmin) return { success: false, error: "not-admin" };
      await transact(
        tx.conversations[conversationId].update({ title: trimmed }),
      );
      return { success: true };
    },
    getMessages: async ({ payload, publicSignKey, nonce, authToken }) => {
      const authOk = await verifyAuthToken<{
        conversationId: string;
        limit?: number;
        before?: number;
      }>({
        action: "getMessages",
        payload,
        publicSignKey,
        nonce,
        authToken,
      });
      if (!authOk) return { error: "invalid-auth" };
      const { conversationId, limit = 50, before } = payload;
      const { conversations } = await query({
        conversations: {
          participants: {},
          $: { where: { id: conversationId } },
        },
      });
      if (!conversations.length) return { error: "not-participant" };
      const isParticipant = conversations[0].participants.some(
        (p: { publicSignKey: string }) => p.publicSignKey === publicSignKey,
      );
      if (!isParticipant) return { error: "not-participant" };
      const fetchLimit = limit + 1;
      const { messages } = await query({
        messages: {
          conversation: {},
          $: {
            where: before !== undefined
              ? { conversation: conversationId, timestamp: { $lt: before } }
              : { conversation: conversationId },
            order: { timestamp: "desc" as const },
            limit: fetchLimit,
          },
        },
      });
      const msgs = messages ?? [];
      const sliced = msgs.slice(0, limit);
      return {
        messages: sliced.map(
          (m: { id: string; payload: unknown; timestamp: number }) => ({
            id: m.id,
            payload: m.payload,
            timestamp: m.timestamp,
          }),
        ),
        hasMore: msgs.length > limit,
      };
    },
    getVapidPublicKey: () =>
      Promise.resolve({ publicKey: getVapidPublicKey() }),
    registerPushSubscription: async (
      { payload, publicSignKey, nonce, authToken },
    ) => {
      if (!isSafeWebhookUrl(payload.subscription.endpoint)) {
        throw new Error("Invalid push subscription endpoint");
      }
      const authed = await verifyAuthToken<{
        subscription: PushSubscriptionJSON;
        conversationId?: string;
      }>({
        action: "registerPushSubscription",
        payload,
        publicSignKey,
        nonce,
        authToken,
      });
      if (!authed) return { success: true };
      const { subscription, conversationId } = payload;
      const { identities } = await query({
        identities: { $: { where: { publicSignKey } } },
      });
      if (identities.length === 0) return { success: true };
      const identity = identities[0];
      // If scoping to a conversation, ensure this identity is a participant
      if (conversationId) {
        const { conversations } = await query({
          conversations: {
            participants: {},
            $: { where: { id: conversationId } },
          },
        });
        const isParticipant = conversations.length > 0 &&
          conversations[0].participants.some((p: { publicSignKey: string }) =>
            p.publicSignKey === publicSignKey
          );
        if (!isParticipant) return { success: true };
      }
      const { pushSubscriptions } = await query({
        pushSubscriptions: {
          $: { where: { endpoint: subscription.endpoint } },
        },
      });
      if (pushSubscriptions.length) {
        await transact(
          tx.pushSubscriptions[pushSubscriptions[0].id]
            .update({ subscription })
            .link({
              owner: identity.id,
              ...(conversationId ? { conversation: conversationId } : {}),
            }),
        );
      } else {
        await transact(
          tx.pushSubscriptions[id()]
            .update({
              endpoint: subscription.endpoint,
              subscription,
              createdAt: Date.now(),
            })
            .link({
              owner: identity.id,
              ...(conversationId ? { conversation: conversationId } : {}),
            }),
        );
      }
      return { success: true };
    },
    unregisterPushSubscription: async (
      { payload, publicSignKey, nonce, authToken },
    ) => {
      const authed = await verifyAuthToken<{ endpoint: string }>({
        action: "unregisterPushSubscription",
        payload,
        publicSignKey,
        nonce,
        authToken,
      });
      if (!authed) return { success: true };
      const { endpoint } = payload;
      const { pushSubscriptions } = await query({
        pushSubscriptions: { $: { where: { endpoint } } },
      });
      if (pushSubscriptions.length) {
        // Only allow owner to delete
        const { pushSubscriptions: withOwner } = await query({
          pushSubscriptions: {
            owner: {},
            $: { where: { id: pushSubscriptions[0].id } },
          },
        });
        if (
          withOwner.length &&
          withOwner[0].owner?.publicSignKey === publicSignKey
        ) {
          await transact(
            tx.pushSubscriptions[pushSubscriptions[0].id].delete(),
          );
        }
      }
      return { success: true };
    },
    heartbeat: async ({ payload, publicSignKey, nonce, authToken }) => {
      const authed = await verifyAuthToken<Record<string, never>>({
        action: "heartbeat",
        payload,
        publicSignKey,
        nonce,
        authToken,
      });
      if (!authed) return { success: true };
      const { identities } = await query({
        identities: { $: { where: { publicSignKey } } },
      });
      if (identities.length === 0) return { success: true };
      await transact(
        tx.identities[identities[0].id].update({ lastActiveAt: Date.now() }),
      );
      return { success: true };
    },
    storeTransferPayload: ({ encryptedPayload }) => {
      if (encryptedPayload.length > MAX_TRANSFER_PAYLOAD_CHARS) {
        return Promise.reject(
          new Error("Transfer payload exceeds maximum size"),
        );
      }
      const now = Date.now();
      transferPayloads.forEach((entry, k) => {
        if (now > entry.expiresAt) transferPayloads.delete(k);
      });
      if (transferPayloads.size >= MAX_TRANSFER_ENTRIES) {
        const excess = transferPayloads.size - MAX_TRANSFER_ENTRIES + 1;
        Array.from(transferPayloads.keys())
          .slice(0, excess)
          .forEach((k) => transferPayloads.delete(k));
      }
      const relayId = crypto.randomUUID();
      transferPayloads.set(relayId, {
        encryptedPayload,
        expiresAt: now + TRANSFER_TTL_MS,
      });
      return Promise.resolve({ relayId });
    },
    retrieveTransferPayload: ({ relayId }) => {
      const entry = transferPayloads.get(relayId);
      transferPayloads.delete(relayId);
      if (!entry || Date.now() > entry.expiresAt) {
        return Promise.resolve({ error: "not-found" });
      }
      return Promise.resolve({ encryptedPayload: entry.encryptedPayload });
    },
    getUploadUrl: async ({ payload, publicSignKey, nonce, authToken }) => {
      const authed = await verifyAuthToken<{
        conversationId: string;
        contentHash: string;
        fileName: string;
        contentType: string;
      }>({
        action: "getUploadUrl",
        payload,
        publicSignKey,
        nonce,
        authToken,
      });
      if (!authed) return { error: "not-participant" };
      const { conversationId, contentHash, fileName, contentType } = payload;
      const { conversations } = await query({
        conversations: {
          participants: {},
          $: { where: { id: conversationId } },
        },
      });
      if (!conversations.length) return { error: "invalid-conversation" };
      const isParticipant = conversations[0].participants.some(
        (p: { publicSignKey: string }) => p.publicSignKey === publicSignKey,
      );
      if (!isParticipant) return { error: "not-participant" };
      return generateUploadUrl({
        conversationId,
        contentHash,
        fileName,
        contentType,
      });
    },
    saveCanvas: async ({ payload, publicSignKey, nonce, authToken }) => {
      const authOk = await verifyAuthToken({
        action: "saveCanvas",
        payload,
        publicSignKey,
        nonce,
        authToken,
      });
      if (!authOk) {
        return { ok: false as const, error: "invalid-auth" as const };
      }
      const { conversationId, encrypted, expectedVersion } = payload;
      return withWalletLock(`canvas:${conversationId}`, async () => {
        const { conversations } = await query({
          conversations: {
            participants: {},
            canvas: {},
            $: { where: { id: conversationId } },
          },
        });
        if (conversations.length === 0) {
          return { ok: false as const, error: "not-participant" as const };
        }
        const isParticipant = conversations[0].participants.some(
          (p: { publicSignKey: string }) => p.publicSignKey === publicSignKey,
        );
        if (!isParticipant) {
          return { ok: false as const, error: "not-participant" as const };
        }
        const rawCanvas = conversations[0].canvas;
        const existing = Array.isArray(rawCanvas) ? rawCanvas[0] : rawCanvas;
        const currentVersion = existing?.version ?? 0;
        if (currentVersion !== expectedVersion) {
          return {
            ok: false as const,
            error: "conflict" as const,
            currentEncrypted: typeof existing?.encrypted === "string"
              ? existing.encrypted
              : undefined,
            currentVersion,
          };
        }
        const nextVersion = currentVersion + 1;
        const canvasId = existing?.id ?? id();
        const changes = {
          encrypted: encrypted as EncryptedSymmetric<string>,
          version: nextVersion,
          updatedAt: Date.now(),
          updatedBy: publicSignKey,
        };
        await transact(
          existing ? tx.canvases[canvasId].update(changes) : [
            tx.canvases[canvasId].update(changes).link({
              conversation: conversationId,
            }),
          ],
        );
        return { ok: true as const, version: nextVersion };
      });
    },
  },
};

const relaySockets = new Map<string, Set<WebSocket>>();
const relayQueue = new Map<
  string,
  { body: unknown; expiresAt: number }[]
>();

const RELAY_MSG_TTL_MS = 3600_000;
const MAX_RELAY_BODY_BYTES = 256 * 1024;
const MAX_RELAY_MESSAGES_PER_TOKEN = 200;
const MAX_RELAY_TOKEN_QUEUES = 1_000;
const MAX_UI_UPDATE_BODY_BYTES = 65_536;

const hasValidRelaySecret = (req: Request): boolean => {
  const secret = Deno.env.get("RELAY_WEBHOOK_SECRET") ?? "";
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

export const relayStoreMessage = (token: string, body: unknown) => {
  const serialized = JSON.stringify(body);
  if (new TextEncoder().encode(serialized).byteLength > MAX_RELAY_BODY_BYTES) {
    return Promise.reject(new Error("Relay message exceeds maximum size"));
  }
  const sockets = relaySockets.get(token);
  const openSockets = sockets
    ? [...sockets].filter((s) => s.readyState === WebSocket.OPEN)
    : [];
  if (openSockets.length > 0) {
    openSockets.forEach((s) => s.send(serialized));
    return Promise.resolve();
  }
  const now = Date.now();
  if (!relayQueue.has(token) && relayQueue.size >= MAX_RELAY_TOKEN_QUEUES) {
    relayQueue.forEach((msgs, k) => {
      const live = msgs.filter((m) => now <= m.expiresAt);
      if (live.length === 0) relayQueue.delete(k);
      else relayQueue.set(k, live);
    });
    if (relayQueue.size >= MAX_RELAY_TOKEN_QUEUES) {
      const excess = relayQueue.size - MAX_RELAY_TOKEN_QUEUES + 1;
      Array.from(relayQueue.keys())
        .slice(0, excess)
        .forEach((k) => relayQueue.delete(k));
    }
  }
  const existing = (relayQueue.get(token) ?? [])
    .filter((m) => now <= m.expiresAt)
    .slice(-(MAX_RELAY_MESSAGES_PER_TOKEN - 1));
  existing.push({ body, expiresAt: now + RELAY_MSG_TTL_MS });
  relayQueue.set(token, existing);
  return Promise.resolve();
};

const relayStore = async (token: string, req: Request): Promise<Response> => {
  if (!hasValidRelaySecret(req)) {
    return jsonCorsResponse(
      { error: "External relay webhook POST is forbidden" },
      403,
    );
  }
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_RELAY_BODY_BYTES) {
    return jsonCorsResponse({ error: "Relay payload too large" }, 413);
  }
  await relayStoreMessage(token, JSON.parse(raw));
  return jsonCorsResponse({ ok: true });
};

const relayDrain = (token: string) => {
  const now = Date.now();
  const entries = (relayQueue.get(token) ?? []).filter(
    (m) => now <= m.expiresAt,
  );
  relayQueue.delete(token);
  return Promise.resolve({ messages: entries.map(({ body }) => body) });
};

const corsHeaders = {
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

const respondCors = (x: null | BodyInit, y: ResponseInit) =>
  new Response(x, { ...y, headers: { ...corsHeaders, ...y.headers } });

const jsonCorsResponse = (body: unknown, status = 200) =>
  respondCors(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const relayRoute = (url: URL, method: string) => {
  const match = url.pathname.match(/^\/relay\/(webhook|poll|ws)\/([^/]+)$/);
  if (!match) return null;
  const [, action, token] = match;
  if (method === "POST" && action === "webhook") return { action, token };
  if (method === "GET" && action === "poll") return { action, token };
  if (method === "GET" && action === "ws") return { action, token };
  return null;
};

const readme = Deno.readTextFileSync(
  new URL("../../README.md", import.meta.url),
);

export const handleRequest = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return respondCors(null, { status: 204 });
  try {
    const url = new URL(req.url);
    const relay = relayRoute(url, req.method);
    if (relay) {
      if (relay.action === "ws") {
        if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
          return new Response(null, { status: 501 });
        }
        const { socket, response } = Deno.upgradeWebSocket(req);

        const attachRelaySocket = () => {
          const set = relaySockets.get(relay.token) ?? new Set<WebSocket>();
          set.add(socket);
          relaySockets.set(relay.token, set);

          relayDrain(relay.token).then((pending) => {
            pending.messages.forEach((msg) => {
              if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify(msg));
              }
            });
          });
        };

        if (socket.readyState === WebSocket.OPEN) {
          attachRelaySocket();
        } else {
          socket.onopen = attachRelaySocket;
        }

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "ping") {
              socket.send(JSON.stringify({ type: "pong" }));
            }
          } catch (_) {
            // ignore malformed messages
          }
        };

        socket.onclose = () => {
          const set = relaySockets.get(relay.token);
          if (set) {
            set.delete(socket);
            if (set.size === 0) relaySockets.delete(relay.token);
          }
        };

        return response;
      }
      if (relay.action === "webhook") {
        return await relayStore(relay.token, req);
      }
      return jsonCorsResponse(await relayDrain(relay.token));
    }
    if (url.pathname === "/llms.txt") {
      return respondCors(readme, {
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    if (url.pathname === "/ui-update") {
      const raw = await req.text();
      if (new TextEncoder().encode(raw).byteLength > MAX_UI_UPDATE_BODY_BYTES) {
        return jsonCorsResponse({ error: "Payload too large" }, 413);
      }
      const body = JSON.parse(raw);
      const elementId = body.elementId ||
        url.searchParams.get("elementId");
      const result = await handleUiUpdate({ ...body, elementId });
      return jsonCorsResponse(
        "error" in result ? { error: result.error } : { success: true },
        result.status ?? 200,
      );
    }
    if (req.method !== "POST") {
      return jsonCorsResponse({ error: "not found" }, 404);
    }
    return jsonCorsResponse(
      await apiHandler(backendApiSchema, endpoints, await req.json()),
    );
  } catch (e) {
    console.error(e);
    return jsonCorsResponse(
      { error: e instanceof Error ? e.message : "Internal server error" },
      500,
    );
  }
};

if (import.meta.main) {
  Deno.serve(handleRequest);
}
