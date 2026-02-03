import { id } from "@instantdb/admin";
import { apiHandler } from "typed-api";
import type { PushSubscriptionJSON } from "../../instant.schema.ts";
import { isValidAlias, normalizeAlias } from "../../protocol/src/alias.ts";
import type { EncryptedMessage } from "../../protocol/src/clientApi.ts";
import { type BackendApiImpl, backendApiSchema } from "./api.ts";
import { issueNonceHelper, verifyAuthToken } from "./auth.ts";
import { createConversation } from "./createConversation.ts";
import { auth, query, transact, tx } from "./db.ts";
import {
  callWebhooks,
  sendPushToParticipants,
  vapidPublicKey,
} from "./notificationService.ts";
import { generateUploadUrl } from "./storage.ts";

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
      // Persist the message first; do not block on side effects (webhooks/push)
      await transact(
        tx.messages[messageId]
          .update({
            payload: encryptedMessage as EncryptedMessage,
            timestamp: Date.now(),
          }).link({
            conversation,
          }),
      );
      // Fire-and-forget side effects
      callWebhooks({ messageId }).catch((e) =>
        console.error("webhook dispatch failed", e)
      );
      sendPushToParticipants({ messageId }).catch((e) =>
        console.error("push dispatch failed", e)
      );
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
        identities: { $: { where: { publicSignKey } } },
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

const corsHeaders = {
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

const respondCors = (x: null | BodyInit, y: ResponseInit) =>
  new Response(x, { ...y, headers: { ...corsHeaders, ...y.headers } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return respondCors(null, { status: 204 });
  return respondCors(
    JSON.stringify(
      await apiHandler(backendApiSchema, endpoints, await req.json()),
    ),
    {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    },
  );
});
