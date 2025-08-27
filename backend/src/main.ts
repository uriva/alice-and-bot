import { id } from "@instantdb/admin";
import { apiHandler } from "typed-api";
import { isValidAlias, normalizeAlias } from "../../protocol/src/alias.ts";
import type { EncryptedMessage } from "../../protocol/src/clientApi.ts";
import { type BackendApiImpl, backendApiSchema } from "./api.ts";
import { issueNonceHelper, verifyAuthToken } from "./auth.ts";
import { createConversation } from "./createConversation.ts";
import { auth, query, transact, tx } from "./db.ts";
import { callWebhooks } from "./notificationService.ts";

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
      await transact(
        tx.messages[messageId]
          .update({
            payload: encryptedMessage as EncryptedMessage,
            timestamp: Date.now(),
          }).link({
            conversation,
          }),
      );
      await callWebhooks({ messageId });
      return { messageId };
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
      const { accounts } = await query({
        accounts: { $: { where: { email } } },
      });
      await createIdentityForAccount({
        publicSignKey,
        publicEncryptKey,
        account: accounts[0].id,
      });
      return {};
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
