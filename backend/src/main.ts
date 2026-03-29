// deno-lint-ignore-file
import { id } from "@instantdb/admin";
import { apiHandler } from "typed-api";
import type { PushSubscriptionJSON } from "../../instant.schema.ts";
import { isValidAlias, normalizeAlias } from "../../protocol/src/alias.ts";
import type { EncryptedMessage } from "../../protocol/src/clientApi.ts";
import { type BackendApiImpl, backendApiSchema } from "./api.ts";
import { issueNonceHelper, kv, verifyAuthToken } from "./auth.ts";
import { createConversation } from "./createConversation.ts";
import { auth, query, transact, tx } from "./db.ts";
import {
  callWebhooks,
  sendPushToParticipants,
  vapidPublicKey,
} from "./notificationService.ts";
import { generateUploadUrl } from "./storage.ts";
import { handleUiUpdate } from "./uiUpdate.ts";
import { handleCryptoPayment } from "./cryptoPayment.ts";
import { createHmac } from "node:crypto";
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
      .update({ publicSignKey, publicEncryptKey })
      .link({ account }),
  );
  return { success: true };
};

const TRANSFER_TTL_MS = 5 * 60 * 1000;

const transferKey = (relayId: string) => ["transfer", relayId];

const endpoints: BackendApiImpl = {
  authenticate: (token: string) => auth.verifyToken(token),
  handlers: {
    conversationKey: async ({ conversationId, publicSignKey }) => {
      const { keys } = await query({
        keys: {
          $: {
            where: {
              conversation: conversationId,
              "owner.publicSignKey": publicSignKey,
            },
          },
        },
      });
      return (keys.length === 0)
        ? { error: "no-such-key" }
        : { conversationKey: keys[0].key };
    },
    createConversation,
    sendMessage: async ({ encryptedMessage, conversation }) => {
      const messageId = id();
      const timestamp = Date.now();
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
      // Fire-and-forget side effects
      callWebhooks({
        messageId,
        conversationId: conversation,
        payload: encryptedMessage as EncryptedMessage,
        timestamp,
      }).catch((e) => console.error("webhook dispatch failed", e));
      sendPushToParticipants({
        messageId,
        conversationId: conversation,
        timestamp,
      }).catch((e) => console.error("push dispatch failed", e));
      return { messageId };
    },
    sendTyping: async ({ conversation, isTyping, publicSignKey }) => {
      // Validate conversation & identity exist
      const { conversations, identities } = await query({
        conversations: { $: { where: { id: conversation } } },
        identities: { $: { where: { publicSignKey } } },
      });
      if (conversations.length === 0 || identities.length === 0) {
        return { success: true };
      }
      const identityId = identities[0].id;
      // Find existing typingState for (owner, conversation)
      const { typingStates } = await query({
        typingStates: {
          $: { where: { "owner.id": identityId, conversation } },
        },
      });
      await transact(
        tx.typingStates[typingStates.length > 0 ? typingStates[0].id : id()]
          .update({ updatedAt: isTyping ? Date.now() : 0 })
          .link({ owner: identityId, conversation }),
      );
      // Opportunistic cleanup: occasionally prune stale typingStates for this conversation
      if (Math.random() < 0.15) {
        const now = Date.now();
        const { typingStates: allStates } = await query({
          typingStates: { $: { where: { conversation } } },
        });
        const stale = allStates.filter((t: { id: string; updatedAt: number }) =>
          t.updatedAt === 0 || now - t.updatedAt > 20_000
        );
        await Promise.all(
          stale.map((t: { id: string }) =>
            transact(tx.typingStates[t.id].delete())
          ),
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
    setWebhook: async ({ url, publicSignKey }) => {
      const { identities } = await query({
        identities: { $: { where: { publicSignKey } } },
      });
      if (identities.length === 0) {
        return {
          success: false,
          error: "identity-does-not-exist",
        };
      }
      const identity = identities[0];
      await transact(tx.identities[identity.id].update({ webhook: url }));
      return { success: true };
    },
    getProfile: async ({ publicSignKey }) => {
      const { identities } = await query({
        identities: { $: { where: { publicSignKey } } },
      });
      if (identities.length === 0) return { profile: null };
      const { name, avatar, alias } = identities[0];
      return { profile: { name, avatar, alias } };
    },
    getConversations: async ({ publicSignKeys }) => {
      const { conversations } = await query({
        conversations: {
          participants: {},
          $: {
            where: { "participants.publicSignKey": { $in: publicSignKeys } },
          },
        },
      });
      const filtered = conversations.filter((c) => {
        const participantKeys = c.participants.map(({ publicSignKey }) =>
          publicSignKey
        );
        return (
          publicSignKeys.every((k: string) => participantKeys.includes(k)) &&
          participantKeys.length === publicSignKeys.length
        );
      });
      return { conversations: filtered };
    },
    getConversationInfo: async ({ conversationId }) => {
      const { conversations } = await query({
        conversations: {
          participants: {},
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
        identities: { wallet: {}, $: { where: { publicSignKey } } },
      });
      if (identityMatches.length === 0) {
        return { success: false, error: "not-found" };
      }
      if (!authOk) return { success: false, error: "invalid-auth" };
      await transact(
        tx.identities[identityMatches[0].id].update({ name: trimmed }),
      );
      return { success: true };
    },
    setPriceTag: async ({ payload, publicSignKey, nonce, authToken }) => {
      const authOk = await verifyAuthToken({
        action: "setPriceTag",
        payload,
        publicSignKey,
        nonce,
        authToken,
      });
      if (!authOk) return { success: false, error: "invalid-auth" };
      const { priceTag } = payload;
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
      const authOk = await verifyAuthToken({
        action: "requestPayout",
        payload,
        publicSignKey,
        nonce,
        authToken,
      });
      if (!authOk) return { success: false, error: "invalid-auth" };
      const { amount, walletAddress } = payload;
      const { identities: identityMatches } = await query({
        identities: { wallet: {}, $: { where: { publicSignKey } } },
      });
      if (identityMatches.length === 0) {
        return { success: false, error: "not-found" };
      }

      const identity = identityMatches[0];
      const currentBalance = identity.wallet?.balance || 0;

      if (currentBalance < amount) {
        return { success: false, error: "insufficient-balance" };
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
      return { success: true };
    },
    prepareCryptoPayment: async (
      { payload, publicSignKey, nonce, authToken },
    ) => {
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
      const amount = payload.amount;

      // Get next index
      const { value } = await kv.get<number>(["btc-index"]);
      const index = value ?? 0;
      await kv.set(["btc-index"], index + 1);

      const address = deriveBtcAddress(xpub, index);
      const btcPrice = await getBtcPriceUsd();
      const btcAmount = Number((amount / btcPrice).toFixed(8));

      await kv.set(
        ["btc-addr", address],
        { identityId, publicSignKey, usdAmount: amount, index, btcAmount },
        { expireIn: 60 * 60 * 24 * 30 * 1000 },
      );

      const bitcoinUri = `bitcoin:${address}?amount=${btcAmount}`;
      const qrUrl =
        `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${
          encodeURIComponent(bitcoinUri)
        }`;

      return { address, btcAmount, usdAmount: amount, qrUrl };
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

      const { paymentAddress } = payload;
      const { value: addressData } = await kv.get<
        {
          identityId: string;
          publicSignKey: string;
          usdAmount: number;
          index: number;
          btcAmount: number;
        }
      >(["btc-addr", paymentAddress]);
      if (!addressData) return { success: false, error: "not-found" };
      if (addressData.publicSignKey !== publicSignKey) {
        return { success: false, error: "invalid-auth" };
      }

      const { value: claimed } = await kv.get(["btc-claimed", paymentAddress]);
      if (claimed) return { success: false, error: "already-claimed" };

      const txs = await getAddressTransactions(paymentAddress);
      for (const t of txs) {
        const satoshis = receivedSatoshis(t, paymentAddress);
        if (satoshis <= 0) continue;

        const btcPrice = await getBtcPriceUsd();
        const btcAmount = satoshis / 1e8;
        const usdAmount = Math.round(btcAmount * btcPrice * 100) / 100;

        await kv.set(["btc-claimed", paymentAddress], t.txid, {
          expireIn: 60 * 60 * 24 * 365 * 1000,
        });

        // Credit the wallet
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
          success: true,
          message: `Successfully verified and credited $${usdAmount}`,
        };
      }

      return { success: false, error: "not-paid" };
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
          $: { where: { id: conversationId } },
        },
      });
      if (conversations.length === 0) {
        return { success: false, error: "not-found" };
      }
      const isAdmin = conversations[0].admins.some(
        (a: { publicSignKey: string }) => a.publicSignKey === publicSignKey,
      );
      if (!isAdmin) return { success: false, error: "not-admin" };
      await transact(
        tx.conversations[conversationId].update({ title: trimmed }),
      );
      return { success: true };
    },
    getVapidPublicKey: () => Promise.resolve({ publicKey: vapidPublicKey }),
    registerPushSubscription: async (
      { payload, publicSignKey, nonce, authToken },
    ) => {
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
    storeTransferPayload: async ({ encryptedPayload }) => {
      const relayId = crypto.randomUUID();
      await kv.set(transferKey(relayId), encryptedPayload, {
        expireIn: TRANSFER_TTL_MS,
      });
      return { relayId };
    },
    retrieveTransferPayload: async ({ relayId }) => {
      const k = transferKey(relayId);
      const { value } = await kv.get<string>(k);
      if (!value) return { error: "not-found" };
      await kv.delete(k);
      return { encryptedPayload: value };
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
  },
};


const relaySockets = new Map<string, WebSocket[]>();

const RELAY_MSG_TTL_MS = 3600_000;

const relayStore = async (token: string, req: Request) => {
  const body = await req.json();
  const sockets = relaySockets.get(token) || [];
  if (sockets.length > 0) {
    for (const socket of sockets) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(body));
      }
    }
    return { ok: true };
  }


  const body = await req.json();
  await kv.set(["relay", token, crypto.randomUUID()], body, {
    expireIn: RELAY_MSG_TTL_MS,
  });
  return { ok: true };
};

const relayDrain = async (token: string) => {
  const entries: Deno.KvEntry<unknown>[] = [];
  for await (const entry of kv.list({ prefix: ["relay", token] })) {
    entries.push(entry);
  }
  const op = kv.atomic();
  entries.forEach(({ key }) => op.delete(key));
  await op.commit();
  return { messages: entries.map(({ value }) => value) };
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
  const match = url.pathname.match(/^\/relay\/(webhook|poll)\/([^/]+)$/);
  if (!match) return null;
  const [, action, token] = match;
  if (method === "POST" && action === "webhook") return { action, token };
  if (method === "GET" && action === "poll") return { action, token };
  if (method === "GET" && action === "ws") return { action, token };
  return null;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return respondCors(null, { status: 204 });
  try {
    const url = new URL(req.url);
    const relay = relayRoute(url, req.method);
    if (relay) {
      if (relay.action === "ws") {
        if (req.headers.get("upgrade") !== "websocket") {
          return new Response(null, { status: 501 });
        }
        const { socket, response } = Deno.upgradeWebSocket(req);
        
        socket.onopen = () => {
          const sockets = relaySockets.get(relay.token) || [];
          sockets.push(socket);
          relaySockets.set(relay.token, sockets);
        };
        
        socket.onclose = () => {
          const sockets = relaySockets.get(relay.token) || [];
          const index = sockets.indexOf(socket);
          if (index !== -1) sockets.splice(index, 1);
          if (sockets.length === 0) relaySockets.delete(relay.token);
        };
        
        return response;
      }
      return jsonCorsResponse(
        relay.action === "webhook"
          ? await relayStore(relay.token, req)
          : await relayDrain(relay.token),
      );
    }
    if (url.pathname === "/ui-update") {
      const body = await req.json();
      const elementId = body.elementId ||
        url.searchParams.get("elementId");
      return jsonCorsResponse(
        await handleUiUpdate({ ...body, elementId }),
      );
    }
    if (url.pathname === "/webhook/crypto" && req.method === "POST") {
      const rawBody = await req.text();
      const secret = Deno.env.get("CRYPTO_WEBHOOK_SECRET");
      if (secret) {
        const signature = req.headers.get("x-signature") || "";
        const expected = createHmac("sha512", secret).update(rawBody).digest(
          "hex",
        );
        if (signature !== expected) {
          console.error("Invalid crypto webhook signature");
          return jsonCorsResponse({ error: "Invalid signature" }, 401);
        }
      }

      let body;
      try {
        body = JSON.parse(rawBody);
      } catch (e) {
        body = Object.fromEntries(new URLSearchParams(rawBody).entries());
      }
      await handleCryptoPayment(body as any);
      return jsonCorsResponse({ success: true });
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
});
