// deno-lint-ignore-file
import { id } from "@instantdb/admin";
import { apiHandler } from "typed-api";
import type { PushSubscriptionJSON } from "../../instant.schema.ts";
import { isValidAlias, normalizeAlias } from "../../protocol/src/alias.ts";
import { instantEmailFromPublicSignKey } from "../../protocol/src/instantAuth.ts";
import {
  shortIdFromPublicSignKey,
  shortIdLength,
} from "../../protocol/src/shortId.ts";
import type { EncryptedMessage } from "../../protocol/src/clientApi.ts";
import type { EncryptedSymmetric } from "../../protocol/src/crypto.ts";
import { type BackendApiImpl, backendApiSchema } from "./api.ts";
import { issueNonceHelper, verifyAuthToken } from "./auth.ts";
import {
  getCachedConversation,
  getCachedConversationKey,
  getCachedIdentitiesByPublicSignKeys,
  getCachedIdentityByAlias,
  getCachedIdentityByPublicSignKey,
  getCachedIdentityByShortId,
  invalidateConversation,
  invalidateIdentity,
  invalidatePushSubscriptions,
  peekCachedIdentityByAlias,
  peekCachedIdentityByPublicSignKey,
  peekCachedIdentityByShortId,
  peekCachedPushSubscriptions,
} from "./cache.ts";
import {
  chooseOptimalParticipantKey,
  conversationHasExactParticipants,
} from "./conversationParticipants.ts";
import { createConversation } from "./createConversation.ts";
import { auth, query, transact, tx } from "./db.ts";
import {
  callWebhooks,
  dismissPushForParticipant,
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

export const isConfirmedDepositTx = (tx: unknown): boolean => {
  if (typeof tx !== "object" || tx === null) return false;
  const status = Reflect.get(tx, "status");
  if (typeof status !== "object" || status === null) return false;
  return Reflect.get(status, "confirmed") === true;
};

export const satoshisToCents = (
  satoshis: number,
  btcPriceUsd: number,
): number => Math.round((satoshis / 1e8) * btcPriceUsd * 100);

const turnTtlSeconds = 3600;
const defaultTurnUrl = "turn:34.71.16.134:3478";

const mintEphemeralTurnCredentials = async (
  secret: string,
  tag: string,
  ttlSeconds = turnTtlSeconds,
): Promise<
  { urls: string; username: string; credential: string; ttl: number }
> => {
  const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;
  const username = `${expiry}:${tag}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(username),
  );
  const credential = btoa(
    Array.from(new Uint8Array(sig), (b) => String.fromCharCode(b)).join(""),
  );
  return {
    urls: Deno.env.get("TURN_URL") ?? defaultTurnUrl,
    username,
    credential,
    ttl: ttlSeconds,
  };
};

const resolveAvailableAlias = async (
  alias: string | undefined,
): Promise<string | undefined> => {
  if (!alias) return undefined;
  const normalized = normalizeAlias(alias);
  if (!isValidAlias(normalized)) return undefined;
  const { identities: taken } = await query({
    identities: { $: { where: { alias: normalized } } },
  });
  return taken.length === 0 ? normalized : undefined;
};

const isMissingSchemaAttrError = (err: unknown): boolean =>
  err instanceof Error &&
  err.message.includes("Attributes are missing in your schema");

const createIdentityForAccount = async (
  { publicSignKey, publicEncryptKey, account }: {
    publicSignKey: string;
    publicEncryptKey: string;
    account: string;
  },
): Promise<{ success: true }> => {
  const identityId = id();
  const shortId = await shortIdFromPublicSignKey(publicSignKey);
  const instantEmail = await instantEmailFromPublicSignKey(publicSignKey);
  await transact(
    tx.identities[identityId]
      .update({
        publicSignKey,
        publicEncryptKey,
        shortId,
        instantEmail,
      })
      .link({ account }),
  ).catch((err) => {
    if (!isMissingSchemaAttrError(err)) throw err;
    return transact(
      tx.identities[identityId]
        .update({ publicSignKey, publicEncryptKey, shortId })
        .link({ account }),
    );
  });
  return { success: true };
};

const TRANSFER_TTL_MS = 5 * 60 * 1000;
const MAX_TRANSFER_PAYLOAD_CHARS = 32_768;
const MAX_TRANSFER_ENTRIES = 1_000;

const firstDefined = async (
  lookups: (() => Promise<string | undefined>)[],
): Promise<string | undefined> =>
  lookups.length === 0
    ? undefined
    : (await lookups[0]()) ?? firstDefined(lookups.slice(1));

const resolveIdentityHandle = (handle: string): Promise<string | undefined> => {
  const alias = normalizeAlias(handle);
  const validAlias = isValidAlias(alias);
  const cached = peekCachedIdentityByPublicSignKey(handle) ??
    (validAlias ? peekCachedIdentityByAlias(alias) : undefined) ??
    (handle.length === shortIdLength
      ? peekCachedIdentityByShortId(handle)
      : undefined);
  if (cached) return Promise.resolve(cached.publicSignKey);
  return firstDefined([
    () =>
      getCachedIdentityByPublicSignKey(handle).then((i) => i?.publicSignKey),
    ...(validAlias
      ? [() => getCachedIdentityByAlias(alias).then((i) => i?.publicSignKey)]
      : []),
    ...(handle.length === shortIdLength
      ? [() => getCachedIdentityByShortId(handle).then((i) => i?.publicSignKey)]
      : []),
  ]);
};

const isUnchangedPushSubscription = (
  existing: {
    subscription?: PushSubscriptionJSON;
    owner?: { id: string };
    conversation?: { id: string };
  },
  incoming: PushSubscriptionJSON,
  ownerId: string,
  conversationId?: string,
): boolean =>
  existing.owner?.id === ownerId &&
  existing.subscription?.endpoint === incoming.endpoint &&
  existing.subscription?.keys?.p256dh === incoming.keys.p256dh &&
  existing.subscription?.keys?.auth === incoming.keys.auth &&
  (existing.subscription?.expirationTime ?? null) ===
    (incoming.expirationTime ?? null) &&
  (conversationId === undefined ||
    existing.conversation?.id === conversationId);

const queryMintBootstrap = async ({
  publicSignKey,
  wantConvos,
  targetConvId,
  bootstrapMsgLimit,
}: {
  publicSignKey: string;
  wantConvos: boolean;
  targetConvId?: string;
  bootstrapMsgLimit: number;
}) => {
  if (wantConvos && targetConvId) {
    const res = await query({
      identities: {
        $: { where: { publicSignKey } },
        conversations: {
          participants: {
            $: { fields: ["publicSignKey", "name", "avatar"] },
          },
          archivedBy: {
            $: { where: { publicSignKey }, fields: ["publicSignKey"] },
          },
        },
      },
      conversations: {
        participants: {
          $: { fields: ["publicSignKey", "name", "avatar"] },
        },
        $: { where: { id: targetConvId } },
      },
      keys: {
        $: {
          where: {
            conversation: targetConvId,
            "owner.publicSignKey": publicSignKey,
          },
        },
      },
      messages: {
        $: {
          where: { conversation: targetConvId },
          order: { timestamp: "desc" as const },
          limit: bootstrapMsgLimit + 1,
        },
      },
    });
    return {
      identities: res.identities,
      bootstrap: {
        conversations: res.conversations,
        keys: res.keys,
        messages: res.messages,
      },
    };
  }
  if (wantConvos) {
    const res = await query({
      identities: {
        $: { where: { publicSignKey } },
        conversations: {
          participants: {
            $: { fields: ["publicSignKey", "name", "avatar"] },
          },
          archivedBy: {
            $: { where: { publicSignKey }, fields: ["publicSignKey"] },
          },
        },
      },
    });
    return { identities: res.identities, bootstrap: null };
  }
  if (targetConvId) {
    const res = await query({
      identities: {
        $: { where: { publicSignKey } },
      },
      conversations: {
        participants: {
          $: { fields: ["publicSignKey", "name", "avatar"] },
        },
        $: { where: { id: targetConvId } },
      },
      keys: {
        $: {
          where: {
            conversation: targetConvId,
            "owner.publicSignKey": publicSignKey,
          },
        },
      },
      messages: {
        $: {
          where: { conversation: targetConvId },
          order: { timestamp: "desc" as const },
          limit: bootstrapMsgLimit + 1,
        },
      },
    });
    return {
      identities: res.identities,
      bootstrap: {
        conversations: res.conversations,
        keys: res.keys,
        messages: res.messages,
      },
    };
  }
  const res = await query({
    identities: {
      $: { where: { publicSignKey } },
    },
  });
  return { identities: res.identities, bootstrap: null };
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
    conversationKey: async ({ conversationId, publicSignKey, auth }) => {
      if (auth === undefined) return { error: "no-such-key" };
      const authOk = await verifyAuthToken({
        action: "conversationKey",
        payload: { conversationId },
        publicSignKey,
        nonce: auth.nonce,
        authToken: auth.authToken,
      });
      if (!authOk) return { error: "no-such-key" };
      const key = await getCachedConversationKey(publicSignKey, conversationId);
      return key ? { conversationKey: key } : { error: "no-such-key" };
    },
    createConversation,
    sendMessage: async (
      { encryptedMessage, conversation, silent, senderPublicSignKey, auth },
    ) => {
      console.log(
        "[DEBUG sendMessage] received for conversation",
        conversation,
      );
      if (auth === undefined || !senderPublicSignKey) {
        throw new Error("Invalid auth");
      }
      const authOk = await verifyAuthToken({
        action: "sendMessage",
        payload: { conversation, encryptedMessage },
        publicSignKey: senderPublicSignKey,
        nonce: auth.nonce,
        authToken: auth.authToken,
      });
      if (!authOk) {
        throw new Error("Invalid auth");
      }
      const convResult = await fetchWebhookConversation(conversation);
      if (convResult.conversations.length === 0) {
        throw new Error("Conversation not found");
      }
      const sender = convResult.conversations[0].participants.find(
        (p) => p.publicSignKey === senderPublicSignKey,
      );
      if (!sender) {
        throw new Error("Not a participant");
      }
      const messageId = id();
      const timestamp = Date.now();
      const prefetchedConversations = Promise.resolve(convResult);
      const cachedSenderPushSubs = peekCachedPushSubscriptions(sender.id);
      const shouldDismissSenderPush = silent !== true &&
        !(cachedSenderPushSubs.hit && cachedSenderPushSubs.value.length === 0);
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
                  encryptedMessage,
                  timestamp,
                  senderPublicSignKey,
                  prefetchedConversations,
                }).catch((e) => console.error("push dispatch failed", e)),
              ]
              : []),
            ...(shouldDismissSenderPush
              ? [
                dismissPushForParticipant({
                  conversationId: conversation,
                  publicSignKey: senderPublicSignKey,
                  identityId: sender.id,
                }).catch((e) => console.error("push dismiss failed", e)),
              ]
              : []),
          ]).then(() => resolve());
        }, 0);
      });
      registerBackgroundTask(dispatchPromise);
      return { messageId };
    },
    sendTyping: async ({ conversation, isTyping, publicSignKey, auth }) => {
      if (auth === undefined) return { success: true };
      const authOk = await verifyAuthToken({
        action: "sendTyping",
        payload: { conversation, isTyping },
        publicSignKey,
        nonce: auth.nonce,
        authToken: auth.authToken,
      });
      if (!authOk) return { success: true };
      const conv = await getCachedConversation(conversation);
      const participant = conv?.participants.find(
        (p) => p.publicSignKey === publicSignKey,
      );
      if (!participant) {
        return { success: true };
      }
      const { typingStates } = await query({
        typingStates: {
          $: { where: { "owner.publicSignKey": publicSignKey, conversation } },
        },
      });
      await transact(
        tx.typingStates[typingStates.length > 0 ? typingStates[0].id : id()]
          .update({ updatedAt: isTyping ? Date.now() : 0 })
          .link({ owner: participant.id, conversation }),
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
            if (stale.length > 0) {
              await transact(
                stale.map((t: { id: string }) =>
                  tx.typingStates[t.id].delete()
                ),
              );
            }
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
      const finalAlias = await resolveAvailableAlias(alias);
      const identityId = id();
      const shortId = await shortIdFromPublicSignKey(publicSignKey);
      const baseFields = {
        name,
        publicSignKey,
        publicEncryptKey,
        shortId,
        ...(finalAlias ? { alias: finalAlias } : {}),
      };
      const instantEmail = await instantEmailFromPublicSignKey(publicSignKey);
      await transact(
        tx.identities[identityId].update({ ...baseFields, instantEmail }),
      ).catch((err) => {
        if (!isMissingSchemaAttrError(err)) throw err;
        return transact(tx.identities[identityId].update(baseFields));
      });
      invalidateIdentity(publicSignKey, { aliases: [finalAlias], shortId });
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
      invalidateIdentity(publicSignKey);
      return { success: true };
    },
    setWebhook: async ({ url, publicSignKey, auth }) => {
      if (auth === undefined) {
        return { success: false, error: "invalid-auth" as const };
      }
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
      if (!isSafeWebhookUrl(url, { allowEmpty: true })) {
        return { success: false, error: "invalid-url" as const };
      }
      const identity = await getCachedIdentityByPublicSignKey(publicSignKey);
      if (!identity) {
        return {
          success: false,
          error: "identity-does-not-exist" as const,
        };
      }
      await transact(tx.identities[identity.id].update({ webhook: url }));
      invalidateIdentity(publicSignKey);
      return { success: true };
    },
    getProfile: async ({ publicSignKey }) => {
      const identity = await getCachedIdentityByPublicSignKey(publicSignKey);
      if (!identity) return { profile: null };
      const { name, avatar, alias, priceTag } = identity;
      return { profile: { name, avatar, alias, priceTag } };
    },
    getConversations: async ({ publicSignKeys, auth }) => {
      if (auth === undefined) return { conversations: [] };
      const authOk = await verifyAuthToken({
        action: "getConversations",
        payload: { publicSignKeys },
        publicSignKey: auth.publicSignKey,
        nonce: auth.nonce,
        authToken: auth.authToken,
      });
      if (!authOk || !publicSignKeys.includes(auth.publicSignKey)) {
        return { conversations: [] };
      }
      if (publicSignKeys.length === 0) return { conversations: [] };
      const identities = await getCachedIdentitiesByPublicSignKeys(
        publicSignKeys,
      );
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
    getConversationInfo: async ({ conversationId, auth }) => {
      if (auth === undefined) return { error: "not-found" };
      const authOk = await verifyAuthToken({
        action: "getConversationInfo",
        payload: { conversationId },
        publicSignKey: auth.publicSignKey,
        nonce: auth.nonce,
        authToken: auth.authToken,
      });
      if (!authOk) return { error: "not-found" };
      const conversation = await getCachedConversation(conversationId);
      if (!conversation) return { error: "not-found" };
      if (
        !conversation.participants.some(
          (p) => p.publicSignKey === auth.publicSignKey,
        )
      ) {
        return { error: "not-found" };
      }
      const limited = conversation.participants.slice(0, 10);
      return {
        conversationInfo: {
          participants: limited.map((
            { publicSignKey, name, avatar, alias },
          ) => ({
            publicSignKey,
            name,
            avatar,
            alias,
          })),
          isPartial: conversation.participants.length > limited.length,
          hasCanvas: conversation.hasCanvas,
        },
      };
    },
    issueNonce: async ({ publicSignKey }) => ({
      nonce: await issueNonceHelper(publicSignKey),
    }),
    aliasToPublicSignKey: async ({ alias }) => {
      const identity = await getCachedIdentityByAlias(alias);
      if (!identity) return { error: "no-such-alias" };
      return { publicSignKey: identity.publicSignKey };
    },
    resolveHandle: async ({ handle }) => {
      const stripped = handle.trim().replace(/^@/, "");
      const publicSignKey = await resolveIdentityHandle(stripped);
      return publicSignKey
        ? { publicSignKey }
        : { error: "no-such-handle" as const };
    },
    publicSignKeyToAlias: async ({ publicSignKey }) => {
      const identity = await getCachedIdentityByPublicSignKey(publicSignKey);
      if (!identity) return { error: "no-such-identity" };
      const alias = identity.alias;
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
      if (!authOk) return { success: false, error: "invalid-auth" };
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
      const { identities: taken } = await query({
        identities: { $: { where: { alias } } },
      });
      if (taken.length > 0 && taken[0].id !== identityMatches[0].id) {
        return { success: false, error: "alias-taken" };
      }
      await transact(
        tx.identities[identityMatches[0].id].update({ alias }),
      );
      invalidateIdentity(publicSignKey, {
        aliases: [identityMatches[0].alias, alias],
      });
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
      if (!authOk) return { success: false, error: "invalid-auth" };
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
      invalidateIdentity(publicSignKey);
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
      if (!authOk) return { success: false, error: "invalid-auth" };
      const avatar = payload.avatar?.trim() || undefined;
      if (avatar && (avatar.length > 2048 || !isSafeWebhookUrl(avatar))) {
        return { success: false, error: "invalid-avatar" };
      }
      const identity = await getCachedIdentityByPublicSignKey(publicSignKey);
      if (!identity) {
        return { success: false, error: "not-found" };
      }
      await transact(
        tx.identities[identity.id].update({ avatar }),
      );
      invalidateIdentity(publicSignKey);
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
      const identity = await getCachedIdentityByPublicSignKey(publicSignKey);
      if (!identity) {
        return { success: false, error: "not-found" };
      }
      await transact(
        tx.identities[identity.id].update({ priceTag }),
      );
      invalidateIdentity(publicSignKey);
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

      const identity = await getCachedIdentityByPublicSignKey(publicSignKey);
      if (!identity) return { error: "not-found" };

      const identityId = identity.id;

      return withWalletLock("__crypto_payment_index__", async () => {
        const { cryptoPayments: latestPayments } = await query({
          cryptoPayments: {
            $: { order: { index: "desc" as const }, limit: 1 },
          },
        });
        const index = latestPayments.length > 0
          ? (latestPayments[0].index ?? -1) + 1
          : 0;

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
          if (!isConfirmedDepositTx(t)) continue;
          const satoshis = receivedSatoshis(t, paymentAddress);
          if (satoshis <= 0) continue;

          const btcPrice = await getBtcPriceUsd();
          const centsAmount = satoshisToCents(satoshis, btcPrice);
          if (centsAmount <= 0) continue;

          const { identities: identityMatches } = await query({
            identities: {
              wallet: {},
              $: { where: { id: addressData.identityId } },
            },
          });

          const identity = identityMatches[0];
          const currentBalance = identity?.wallet?.balance || 0;
          await transact([
            tx.cryptoPayments[addressData.id].update({ claimedTxid: t.txid }),
            ...(identity
              ? [
                tx.wallets[identity.wallet?.id || id()].update({
                  balance: currentBalance + centsAmount,
                }).link({ identity: identity.id }),
                tx.transactions[id()].update({
                  amount: centsAmount,
                  type: "deposit",
                  timestamp: Date.now(),
                  status: "completed",
                  walletAddress: t.txid,
                }).link({ receiver: identity.id }),
              ]
              : []),
          ]);

          return {
            success: true as const,
            message: `Successfully verified and credited $${
              (centsAmount / 100).toFixed(2)
            }`,
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
      invalidateConversation(conversationId);
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
      const conversation = await getCachedConversation(conversationId);
      if (!conversation) return { error: "not-participant" };
      const isParticipant = conversation.participants.some(
        (p) => p.publicSignKey === publicSignKey,
      );
      if (!isParticipant) return { error: "not-participant" };
      const fetchLimit = limit + 1;
      const { messages } = await query({
        messages: {
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
    getTurnCredentials: async (
      { payload, publicSignKey, nonce, authToken },
    ) => {
      const authOk = await verifyAuthToken({
        action: "getTurnCredentials",
        payload,
        publicSignKey,
        nonce,
        authToken,
      });
      if (!authOk) return { error: "invalid-auth" };
      const secret = (Deno.env.get("TURN_AUTH_SECRET") ?? "").trim();
      if (!secret) return { error: "missing-secret" };
      return mintEphemeralTurnCredentials(
        secret,
        await shortIdFromPublicSignKey(publicSignKey),
      );
    },
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
      const identity = await getCachedIdentityByPublicSignKey(publicSignKey);
      if (!identity) return { success: true };
      // If scoping to a conversation, ensure this identity is a participant
      if (conversationId) {
        const conversation = await getCachedConversation(conversationId);
        const isParticipant = Boolean(
          conversation?.participants.some(
            (p) => p.publicSignKey === publicSignKey,
          ),
        );
        if (!isParticipant) return { success: true };
      }
      const cachedSubs = peekCachedPushSubscriptions(identity.id);
      if (
        cachedSubs.hit &&
        cachedSubs.value.some((row) =>
          isUnchangedPushSubscription(
            row,
            subscription,
            identity.id,
            conversationId,
          )
        )
      ) {
        return { success: true };
      }
      const { pushSubscriptions } = await query({
        pushSubscriptions: {
          owner: {},
          conversation: {},
          $: { where: { endpoint: subscription.endpoint } },
        },
      });
      if (pushSubscriptions.length) {
        const existing = pushSubscriptions[0];
        if (
          isUnchangedPushSubscription(
            existing,
            subscription,
            identity.id,
            conversationId,
          )
        ) {
          return { success: true };
        }
        const existingNotified = existing.subscription?.notifiedConversations;
        await transact(
          tx.pushSubscriptions[existing.id]
            .update({
              subscription: existingNotified
                ? { ...subscription, notifiedConversations: existingNotified }
                : subscription,
            })
            .link({
              owner: identity.id,
              ...(conversationId ? { conversation: conversationId } : {}),
            }),
        );
        invalidatePushSubscriptions(identity.id);
        if (existing.owner?.id && existing.owner.id !== identity.id) {
          invalidatePushSubscriptions(existing.owner.id);
        }
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
        invalidatePushSubscriptions(identity.id);
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
        pushSubscriptions: {
          owner: {},
          $: { where: { endpoint } },
        },
      });
      const existing = pushSubscriptions[0];
      if (existing && existing.owner?.publicSignKey === publicSignKey) {
        await transact(tx.pushSubscriptions[existing.id].delete());
        if (existing.owner?.id) {
          invalidatePushSubscriptions(existing.owner.id);
        }
      }
      return { success: true };
    },
    dismissNotifications: async (
      { payload, publicSignKey, nonce, authToken },
    ) => {
      const authed = await verifyAuthToken<{
        conversationId: string;
        excludeEndpoint?: string;
      }>({
        action: "dismissNotifications",
        payload,
        publicSignKey,
        nonce,
        authToken,
      });
      if (!authed) return { success: true };
      registerBackgroundTask(
        dismissPushForParticipant({
          conversationId: payload.conversationId,
          publicSignKey,
          excludeEndpoint: payload.excludeEndpoint,
        }).catch((e) => console.error("dismissNotifications failed", e)),
      );
      return { success: true };
    },
    heartbeat: async ({ payload, publicSignKey, nonce, authToken }) => {
      await verifyAuthToken<Record<string, never>>({
        action: "heartbeat",
        payload,
        publicSignKey,
        nonce,
        authToken,
      });
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
      const conversation = await getCachedConversation(conversationId);
      if (!conversation) return { error: "invalid-conversation" };
      const isParticipant = conversation.participants.some(
        (p) => p.publicSignKey === publicSignKey,
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
      const conversation = await getCachedConversation(conversationId);
      if (
        !conversation ||
        !conversation.participants.some((p) =>
          p.publicSignKey === publicSignKey
        )
      ) {
        return { ok: false as const, error: "not-participant" as const };
      }
      return withWalletLock(`canvas:${conversationId}`, async () => {
        const { canvases } = await query({
          canvases: {
            $: { where: { conversation: conversationId } },
          },
        });
        const existing = canvases[0];
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
        if (!existing) invalidateConversation(conversationId);
        return { ok: true as const, version: nextVersion };
      });
    },
    mintInstantToken: async ({ payload, publicSignKey, nonce, authToken }) => {
      const authOk = await verifyAuthToken({
        action: "mintInstantToken",
        payload,
        publicSignKey,
        nonce,
        authToken,
      });
      if (!authOk) return { error: "invalid-auth" };
      const wantConvos = Boolean(payload.includeConversations);
      const targetConvId = payload.conversationId;
      const bootstrapMsgLimit = 30;

      const { identities, bootstrap: convoBootstrapRes } =
        await queryMintBootstrap({
          publicSignKey,
          wantConvos,
          targetConvId,
          bootstrapMsgLimit,
        });

      if (identities.length === 0) return { error: "not-found" };
      const identity = identities[0];
      const instantEmail = await instantEmailFromPublicSignKey(publicSignKey);
      if (identity.instantEmail !== instantEmail) {
        await transact(tx.identities[identity.id].update({ instantEmail }))
          .catch((err) => {
            if (!isMissingSchemaAttrError(err)) throw err;
          });
        invalidateIdentity(publicSignKey);
      }
      const token = await auth.createToken(instantEmail);

      const conversations = wantConvos
        ? ("conversations" in identity && Array.isArray(identity.conversations)
          ? identity.conversations
          : []).map((c: any) => ({
            id: c.id,
            title: c.title,
            ...(c.updatedAt !== undefined ? { updatedAt: c.updatedAt } : {}),
            participants: (c.participants ?? []).map((p: any) => ({
              publicSignKey: p.publicSignKey,
              ...(p.name !== undefined ? { name: p.name } : {}),
              ...(p.avatar !== undefined ? { avatar: p.avatar } : {}),
            })),
            ...(c.archivedBy !== undefined
              ? {
                archivedBy: c.archivedBy.map((a: any) => ({
                  publicSignKey: a.publicSignKey,
                })),
              }
              : {}),
          }))
        : undefined;

      const buildConversationBootstrap = () => {
        if (!targetConvId || !convoBootstrapRes) {
          return undefined;
        }
        const conv = convoBootstrapRes.conversations[0];
        const isParticipant = Boolean(
          conv?.participants?.some(
            (p: { publicSignKey: string }) => p.publicSignKey === publicSignKey,
          ),
        );
        const encryptedKey = isParticipant
          ? convoBootstrapRes.keys[0]?.key
          : undefined;
        if (!isParticipant || typeof encryptedKey !== "string") {
          return {
            conversationId: targetConvId,
            hasAccess: false,
            messages: [],
            hasMore: false,
          };
        }
        const rawMsgs = convoBootstrapRes.messages ?? [];
        return {
          conversationId: targetConvId,
          hasAccess: true,
          title: conv?.title,
          participants: (conv?.participants ?? []).map((p: any) => ({
            publicSignKey: p.publicSignKey,
            ...(p.name !== undefined ? { name: p.name } : {}),
            ...(p.avatar !== undefined ? { avatar: p.avatar } : {}),
          })),
          encryptedKey,
          messages: rawMsgs.slice(0, bootstrapMsgLimit).map(
            (m: { id: string; payload: unknown; timestamp: number }) => ({
              id: m.id,
              payload: m.payload,
              timestamp: m.timestamp,
            }),
          ),
          hasMore: rawMsgs.length > bootstrapMsgLimit,
        };
      };

      const conversationBootstrap = buildConversationBootstrap();

      return {
        token,
        instantEmail,
        ...(conversations !== undefined ? { conversations } : {}),
        ...(conversationBootstrap !== undefined
          ? { conversationBootstrap }
          : {}),
      };
    },
    getCanvasRow: async ({ conversationId, auth }) => {
      if (auth === undefined) return { row: null };
      const authOk = await verifyAuthToken({
        action: "getCanvasRow",
        payload: { conversationId },
        publicSignKey: auth.publicSignKey,
        nonce: auth.nonce,
        authToken: auth.authToken,
      });
      if (!authOk) return { row: null };
      const conversation = await getCachedConversation(conversationId);
      if (
        !conversation ||
        !conversation.participants.some(
          (p) => p.publicSignKey === auth.publicSignKey,
        )
      ) {
        return { row: null };
      }
      if (!conversation.hasCanvas) return { row: null };
      const { canvases } = await query({
        canvases: {
          $: { where: { conversation: conversationId } },
        },
      });
      const canvas = canvases[0];
      if (!canvas || typeof canvas.encrypted !== "string") return { row: null };
      return {
        row: {
          id: canvas.id,
          encrypted: canvas.encrypted,
          version: canvas.version,
        },
      };
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
const MAX_RELAY_SOCKETS_PER_TOKEN = 10;
const MAX_RELAY_SOCKETS_TOTAL = 2_000;
const MAX_UI_UPDATE_BODY_BYTES = 65_536;

const totalRelaySockets = (): number =>
  Array.from(relaySockets.values()).reduce((sum, s) => sum + s.size, 0);

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
        const existingForToken = relaySockets.get(relay.token)?.size ?? 0;
        if (
          existingForToken >= MAX_RELAY_SOCKETS_PER_TOKEN ||
          totalRelaySockets() >= MAX_RELAY_SOCKETS_TOTAL
        ) {
          return jsonCorsResponse({ error: "Too many relay connections" }, 429);
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
