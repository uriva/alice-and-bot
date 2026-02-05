import type { User } from "@instantdb/core";
import { hash } from "@uri/gamla";
import {
  apiClient as apiClientMaker,
  type ApiImplementation,
  endpoint,
  httpCommunication,
} from "typed-api";
import { z } from "zod/v4";
import { buildSignedRequest } from "../../protocol/src/authClient.ts";
import type { Credentials } from "../../protocol/src/clientApi.ts";

const maxEncryptedMessageLength = 50_000;

const authenticatedInput = <T extends z.ZodTypeAny>(payloadSchema: T) =>
  z.object({
    payload: payloadSchema,
    publicSignKey: z.string(),
    nonce: z.string(),
    authToken: z.string(),
  });

const authenticatedEndpoint = <T extends z.ZodTypeAny, O extends z.ZodTypeAny>(
  payloadSchema: T,
  outputSchema: O,
) =>
  endpoint({
    authRequired: false,
    input: authenticatedInput(payloadSchema),
    output: outputSchema,
  });

export const backendApiSchema = {
  issueNonce: endpoint({
    authRequired: false,
    input: z.object({ publicSignKey: z.string() }),
    output: z.object({ nonce: z.string() }),
  }),
  aliasToPublicSignKey: endpoint({
    authRequired: false,
    input: z.object({ alias: z.string() }),
    output: z.union([
      z.object({ publicSignKey: z.string() }),
      z.object({ error: z.enum(["no-such-alias"]) }),
    ]),
  }),
  publicSignKeyToAlias: endpoint({
    authRequired: false,
    input: z.object({ publicSignKey: z.string() }),
    output: z.union([
      z.object({ alias: z.string() }),
      z.object({ error: z.enum(["no-such-identity", "no-alias"]) }),
    ]),
  }),
  setAlias: authenticatedEndpoint(
    z.object({ alias: z.string() }),
    z.union([
      z.object({ success: z.literal(true) }),
      z.object({
        success: z.literal(false),
        error: z.enum([
          "alias-taken",
          "invalid-alias",
          "not-found",
          "invalid-auth",
        ]),
      }),
    ]),
  ),
  conversationKey: endpoint({
    authRequired: false,
    input: z.object({
      conversationId: z.string(),
      publicSignKey: z.string(),
    }),
    output: z.union([
      z.object({ conversationKey: z.string() }),
      z.object({ error: z.literal("no-such-key") }),
    ]),
  }),
  createConversation: endpoint({
    authRequired: false,
    input: z.object({
      publicSignKeyToEncryptedSymmetricKey: z.record(z.string(), z.string()),
      title: z.string(),
    }),
    output: z.union([
      z.object({ conversationId: z.string() }),
      z.object({
        error: z.enum(["invalid-participants", "must-own-an-identity"]),
      }),
    ]),
  }),
  createAccount: endpoint({
    authRequired: false,
    input: z.object({}),
    output: z.object({
      success: z.literal(true),
      accountId: z.string(),
      accessToken: z.string(),
    }),
  }),
  createAnonymousIdentity: endpoint({
    authRequired: false,
    input: z.object({
      name: z.string(),
      publicSignKey: z.string(),
      publicEncryptKey: z.string(),
      alias: z.string().optional(),
    }),
    output: z.object({}),
  }),
  createIdentity: endpoint({
    authRequired: true,
    input: z.object({
      publicSignKey: z.string(),
      publicEncryptKey: z.string(),
    }),
    output: z.union([
      z.object({ success: z.literal(true) }),
      z.object({ success: z.literal(false), error: z.string() }),
    ]),
  }),
  sendMessage: endpoint({
    authRequired: false,
    input: z.object({
      encryptedMessage: z.string().max(maxEncryptedMessageLength),
      conversation: z.string(),
    }),
    output: z.object({ messageId: z.string() }),
  }),
  sendTyping: endpoint({
    authRequired: false,
    input: z.object({
      conversation: z.string(),
      isTyping: z.boolean(),
      publicSignKey: z.string(),
    }),
    output: z.object({ success: z.literal(true) }),
  }),
  setWebhook: endpoint({
    authRequired: false,
    input: z.object({
      url: z.string(),
      publicSignKey: z.string(),
    }),
    output: z.union([
      z.object({ success: z.literal(true) }),
      z.object({
        success: z.literal(false),
        error: z.literal("identity-does-not-exist"),
      }),
    ]),
  }),
  getProfile: endpoint({
    authRequired: false,
    input: z.object({ publicSignKey: z.string() }),
    output: z.object({
      profile: z
        .union([
          z.object({
            name: z.string().optional(),
            avatar: z.string().optional(),
            alias: z.string().optional(),
          }),
          z.null(),
        ]),
    }),
  }),
  getConversations: endpoint({
    authRequired: false,
    input: z.object({ publicSignKeys: z.array(z.string()) }),
    output: z.object({
      conversations: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          participants: z.array(z.object({ publicSignKey: z.string() })),
        }),
      ),
    }),
  }),
  getConversationInfo: endpoint({
    authRequired: false,
    input: z.object({ conversationId: z.string() }),
    output: z.union([
      z.object({
        conversationInfo: z.object({
          participants: z.array(
            z.object({
              publicSignKey: z.string(),
              name: z.string().optional(),
              avatar: z.string().optional(),
              alias: z.string().optional(),
            }),
          ),
          isPartial: z.boolean(),
        }),
      }),
      z.object({ error: z.literal("not-found") }),
    ]),
  }),
  getVapidPublicKey: endpoint({
    authRequired: false,
    input: z.object({}),
    output: z.object({ publicKey: z.string() }),
  }),
  registerPushSubscription: authenticatedEndpoint(
    z.object({
      subscription: z.object({
        endpoint: z.string(),
        expirationTime: z.number().nullable(),
        keys: z.object({ p256dh: z.string(), auth: z.string() }),
      }),
      conversationId: z.string().optional(),
    }),
    z.object({ success: z.literal(true) }),
  ),
  unregisterPushSubscription: authenticatedEndpoint(
    z.object({ endpoint: z.string() }),
    z.object({ success: z.literal(true) }),
  ),
  getUploadUrl: authenticatedEndpoint(
    z.object({
      conversationId: z.string(),
      contentHash: z.string(),
      fileName: z.string(),
      contentType: z.string(),
    }),
    z.union([
      z.object({
        uploadUrl: z.string(),
        fileUrl: z.string(),
        maxSize: z.number(),
      }),
      z.object({ error: z.enum(["not-participant", "invalid-conversation"]) }),
    ]),
  ),
} as const;

export const apiClient = apiClientMaker(
  httpCommunication("https://alice-and-bot.deno.dev"),
  backendApiSchema,
);

export type BackendApiImpl = ApiImplementation<User, typeof backendApiSchema>;

export const setWebhook = (
  { url, credentials: { publicSignKey } }: {
    url: string;
    credentials: Credentials;
  },
): Promise<
  {
    success: false;
    error: "identity-does-not-exist";
  } | { success: true }
> => apiClient({ endpoint: "setWebhook", payload: { url, publicSignKey } });

export const aliasToPublicSignKey = (
  alias: string,
): Promise<{ publicSignKey: string } | { error: "no-such-alias" }> =>
  apiClient({ endpoint: "aliasToPublicSignKey", payload: { alias } });

export const publicSignKeyToAlias = (
  publicSignKey: string,
): Promise<{ alias: string } | { error: "no-such-identity" | "no-alias" }> =>
  apiClient({ endpoint: "publicSignKeyToAlias", payload: { publicSignKey } });

export const issueNonce = (publicSignKey: string): Promise<{ nonce: string }> =>
  apiClient({ endpoint: "issueNonce", payload: { publicSignKey } });

export const setAlias = (
  { alias, publicSignKey, nonce, authToken }: {
    alias: string;
    publicSignKey: string;
    nonce: string;
    authToken: string; // signature over canonical string
  },
): Promise<
  | { success: true }
  | {
    success: false;
    error: "alias-taken" | "invalid-alias" | "not-found" | "invalid-auth";
  }
> =>
  apiClient({
    endpoint: "setAlias",
    payload: { payload: { alias }, publicSignKey, nonce, authToken },
  });

export const canonicalStringForAuthSign = <T>(
  params: { action: string; publicSignKey: string; payload: T; nonce: string },
): string => hash(params, 10);

export const setAliasSigned = async (
  params: { alias: string; credentials: Credentials },
): Promise<
  | { success: true }
  | {
    success: false;
    error: "alias-taken" | "invalid-alias" | "not-found" | "invalid-auth";
  }
> =>
  apiClient({
    endpoint: "setAlias",
    payload: await buildSignedRequest(
      params.credentials,
      "setAlias",
      { alias: params.alias },
    ),
  });

export const registerPushSubscriptionSigned = async (
  credentials: Credentials,
  payload: {
    subscription: {
      endpoint: string;
      expirationTime: number | null;
      keys: { p256dh: string; auth: string };
    };
    conversationId?: string;
  },
): Promise<{ success: true }> =>
  apiClient({
    endpoint: "registerPushSubscription",
    payload: await buildSignedRequest(
      credentials,
      "registerPushSubscription",
      payload,
    ),
  });

export const unregisterPushSubscriptionSigned = async (
  credentials: Credentials,
  payload: { endpoint: string },
): Promise<{ success: true }> =>
  apiClient({
    endpoint: "unregisterPushSubscription",
    payload: await buildSignedRequest(
      credentials,
      "unregisterPushSubscription",
      payload,
    ),
  });

export const getProfile = (
  publicSignKey: string,
): Promise<
  { profile: { name?: string; avatar?: string; alias?: string } | null }
> => apiClient({ endpoint: "getProfile", payload: { publicSignKey } });

export const getConversations = (
  publicSignKeys: string[],
): Promise<
  {
    conversations: {
      id: string;
      title: string;
      participants: { publicSignKey: string }[];
    }[];
  }
> => apiClient({ endpoint: "getConversations", payload: { publicSignKeys } });

export const getConversationInfo = (
  conversationId: string,
): Promise<
  | {
    conversationInfo: {
      participants: {
        publicSignKey: string;
        name?: string;
        avatar?: string;
        alias?: string;
      }[];
      isPartial: boolean;
    };
  }
  | { error: "not-found" }
> =>
  apiClient({ endpoint: "getConversationInfo", payload: { conversationId } });

export const getVapidPublicKey = (): Promise<{ publicKey: string }> =>
  apiClient({ endpoint: "getVapidPublicKey", payload: {} });

export const registerPushSubscription = (
  params: {
    payload: {
      subscription: {
        endpoint: string;
        expirationTime: number | null;
        keys: { p256dh: string; auth: string };
      };
      conversationId?: string;
    };
    publicSignKey: string;
    nonce: string;
    authToken: string;
  },
): Promise<{ success: true }> =>
  apiClient({ endpoint: "registerPushSubscription", payload: params });

export const unregisterPushSubscription = (
  params: {
    payload: { endpoint: string };
    publicSignKey: string;
    nonce: string;
    authToken: string;
  },
): Promise<{ success: true }> =>
  apiClient({ endpoint: "unregisterPushSubscription", payload: params });

export const sendTyping = (
  params: { conversation: string; isTyping: boolean; publicSignKey: string },
): Promise<{ success: true }> =>
  apiClient({ endpoint: "sendTyping", payload: params });

export const getUploadUrl = async (
  credentials: Credentials,
  payload: {
    conversationId: string;
    contentHash: string;
    fileName: string;
    contentType: string;
  },
): Promise<
  { uploadUrl: string; fileUrl: string; maxSize: number } | {
    error: "not-participant" | "invalid-conversation";
  }
> =>
  apiClient({
    endpoint: "getUploadUrl",
    payload: await buildSignedRequest(credentials, "getUploadUrl", payload),
  });
