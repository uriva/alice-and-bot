import type { User } from "@instantdb/core";
import { hash } from "@uri/gamla";
import stringify from "safe-stable-stringify";
import {
  apiClient as apiClientMaker,
  type ApiImplementation,
  endpoint,
  httpCommunication,
} from "typed-api";
import { z } from "zod/v4";
import { buildSignedRequest } from "../../protocol/src/authClient.ts";
import { canSignWithPrivateKey } from "../../protocol/src/crypto.ts";
import { serverBaseUrl } from "../../protocol/src/serverUrl.ts";
import { maxEncryptedMessageLength } from "../../protocol/src/attachmentLimits.ts";
import type { Credentials } from "../../protocol/src/clientApi.ts";
import { lookupRegisteredCredentials } from "../../protocol/src/instantAuth.ts";

export type AuthToken = {
  nonce: string;
  authToken: string;
};

const authTokenSchema = z.object({
  nonce: z.string(),
  authToken: z.string(),
});

const signedCallerAuthSchema = z.object({
  publicSignKey: z.string(),
  nonce: z.string(),
  authToken: z.string(),
});

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
  resolveHandle: endpoint({
    authRequired: false,
    input: z.object({ handle: z.string() }),
    output: z.union([
      z.object({ publicSignKey: z.string() }),
      z.object({ error: z.enum(["no-such-handle"]) }),
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
  setName: authenticatedEndpoint(
    z.object({ name: z.string() }),
    z.union([
      z.object({ success: z.literal(true) }),
      z.object({
        success: z.literal(false),
        error: z.enum(["not-found", "invalid-auth", "invalid-name"]),
      }),
    ]),
  ),
  setAvatar: authenticatedEndpoint(
    z.object({ avatar: z.string().optional() }),
    z.union([
      z.object({ success: z.literal(true) }),
      z.object({
        success: z.literal(false),
        error: z.enum(["not-found", "invalid-auth", "invalid-avatar"]),
      }),
    ]),
  ),
  setPriceTag: authenticatedEndpoint(
    z.object({ priceTag: z.number().nonnegative().finite().optional() }),
    z.union([
      z.object({ success: z.literal(true) }),
      z.object({
        success: z.literal(false),
        error: z.enum(["not-found", "invalid-auth"]),
      }),
    ]),
  ),
  getBalanceAndTransactions: authenticatedEndpoint(
    z.object({}),
    z.union([
      z.object({
        balance: z.number(),
        transactions: z.array(z.object({
          amount: z.number(),
          type: z.string(),
          timestamp: z.number(),
          status: z.string().optional(),
          walletAddress: z.string().optional(),
        })),
      }),
      z.object({ error: z.enum(["not-found", "invalid-auth"]) }),
    ]),
  ),
  requestPayout: authenticatedEndpoint(
    z.object({
      amount: z.number().positive().finite(),
      walletAddress: z.string(),
    }),
    z.union([
      z.object({ success: z.literal(true) }),
      z.object({
        success: z.literal(false),
        error: z.enum(["not-found", "invalid-auth", "insufficient-balance"]),
      }),
    ]),
  ),
  prepareCryptoPayment: authenticatedEndpoint(
    z.object({ amount: z.number().positive().finite() }),
    z.union([
      z.object({
        address: z.string(),
        btcAmount: z.number(),
        usdAmount: z.number(),
        qrUrl: z.string(),
      }),
      z.object({
        error: z.enum(["not-found", "invalid-auth", "missing-secret"]),
      }),
    ]),
  ),
  checkCryptoPayment: authenticatedEndpoint(
    z.object({ paymentAddress: z.string() }),
    z.union([
      z.object({ success: z.literal(true), message: z.string() }),
      z.object({
        success: z.literal(false),
        error: z.enum([
          "not-found",
          "invalid-auth",
          "not-paid",
          "already-claimed",
          "missing-secret",
        ]),
      }),
    ]),
  ),
  conversationKey: endpoint({
    authRequired: false,
    input: z.object({
      conversationId: z.string(),
      publicSignKey: z.string(),
      auth: authTokenSchema.optional(),
    }),
    output: z.union([
      z.object({ conversationKey: z.string() }),
      z.object({ error: z.literal("no-such-key") }),
    ]),
  }),
  createConversation: authenticatedEndpoint(
    z.object({
      publicSignKeyToEncryptedSymmetricKey: z.record(z.string(), z.string()),
      title: z.string(),
    }),
    z.union([
      z.object({ conversationId: z.string() }),
      z.object({
        error: z.enum([
          "invalid-participants",
          "must-own-an-identity",
          "insufficient-balance",
          "invalid-auth",
        ]),
      }),
    ]),
  ),
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
      // The payload is encrypted, so the server cannot tell a canvas event
      // from a chat message. The sender declares that it should not notify.
      silent: z.boolean().optional(),
      senderPublicSignKey: z.string().optional(),
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
      auth: authTokenSchema.optional(),
    }),
    output: z.union([
      z.object({ success: z.literal(true) }),
      z.object({
        success: z.literal(false),
        error: z.enum([
          "identity-does-not-exist",
          "invalid-auth",
          "invalid-url",
        ]),
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
            priceTag: z.number().optional(),
          }),
          z.null(),
        ]),
    }),
  }),
  getConversations: endpoint({
    authRequired: false,
    input: z.object({
      publicSignKeys: z.array(z.string()),
      auth: signedCallerAuthSchema.optional(),
    }),
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
    input: z.object({
      conversationId: z.string(),
      auth: signedCallerAuthSchema.optional(),
    }),
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
          // Whether the conversation has a canvas attached. The canvas text is
          // encrypted, but its existence is not: canvases is its own entity, so
          // this needs no conversation key and lets a host gate a capability on
          // it.
          hasCanvas: z.boolean(),
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
        expirationTime: z.number().nullable().optional().transform((v) =>
          v ?? null
        ),
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
  heartbeat: authenticatedEndpoint(
    z.object({}),
    z.object({ success: z.literal(true) }),
  ),
  storeTransferPayload: endpoint({
    authRequired: false,
    input: z.object({ encryptedPayload: z.string().max(32_768) }),
    output: z.object({ relayId: z.string() }),
  }),
  retrieveTransferPayload: endpoint({
    authRequired: false,
    input: z.object({ relayId: z.string() }),
    output: z.union([
      z.object({ encryptedPayload: z.string() }),
      z.object({ error: z.enum(["not-found"]) }),
    ]),
  }),
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
  renameConversation: authenticatedEndpoint(
    z.object({ conversationId: z.string(), title: z.string() }),
    z.union([
      z.object({ success: z.literal(true) }),
      z.object({
        success: z.literal(false),
        error: z.enum([
          "not-found",
          "invalid-auth",
          "not-admin",
          "invalid-title",
        ]),
      }),
    ]),
  ),
  getMessages: authenticatedEndpoint(
    z.object({
      conversationId: z.string(),
      limit: z.number().int().min(0).max(200).optional(),
      before: z.number().optional(),
    }),
    z.union([
      z.object({
        messages: z.array(z.object({
          id: z.string(),
          payload: z.unknown(),
          timestamp: z.number(),
        })),
        hasMore: z.boolean(),
      }),
      z.object({ error: z.enum(["not-participant", "invalid-auth"]) }),
    ]),
  ),
  saveCanvas: authenticatedEndpoint(
    z.object({
      conversationId: z.string(),
      encrypted: z.string(),
      expectedVersion: z.number().int().min(0),
    }),
    z.union([
      z.object({ ok: z.literal(true), version: z.number() }),
      z.object({
        ok: z.literal(false),
        error: z.enum(["invalid-auth", "not-participant", "conflict"]),
        currentEncrypted: z.string().optional(),
        currentVersion: z.number().optional(),
      }),
    ]),
  ),
  mintInstantToken: authenticatedEndpoint(
    z.object({}),
    z.union([
      z.object({ token: z.string(), instantEmail: z.string() }),
      z.object({ error: z.enum(["invalid-auth", "not-found"]) }),
    ]),
  ),
  getCanvasRow: endpoint({
    authRequired: false,
    input: z.object({
      conversationId: z.string(),
      auth: signedCallerAuthSchema.optional(),
    }),
    output: z.object({
      row: z
        .object({
          id: z.string(),
          encrypted: z.string(),
          version: z.number(),
        })
        .nullable(),
    }),
  }),
} as const;

export const apiClient = apiClientMaker(
  httpCommunication(serverBaseUrl),
  backendApiSchema,
);

export type BackendApiImpl = ApiImplementation<User, typeof backendApiSchema>;

export const setWebhook = async (
  { url, credentials }: {
    url: string;
    credentials: Credentials;
  },
): Promise<
  | {
    success: false;
    error: "identity-does-not-exist" | "invalid-auth" | "invalid-url";
  }
  | { success: true }
> => {
  const signed = (await canSignWithPrivateKey(credentials.privateSignKey))
    ? await buildSignedRequest(credentials, "setWebhook", { url })
    : undefined;
  return apiClient({
    endpoint: "setWebhook",
    payload: {
      url,
      publicSignKey: credentials.publicSignKey,
      ...(signed
        ? { auth: { nonce: signed.nonce, authToken: signed.authToken } }
        : {}),
    },
  });
};

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

export const canonicalStringForAuthSignV2 = async <T>(
  params: { action: string; publicSignKey: string; payload: T; nonce: string },
): Promise<string> => {
  const serialized = stringify({
    endpoint: params.action,
    params: {
      publicSignKey: params.publicSignKey,
      payload: params.payload,
    },
    nonce: params.nonce,
  });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(serialized),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

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

export const setAvatarSigned = async (
  params: { avatar?: string; credentials: Credentials },
): Promise<
  | { success: true }
  | { success: false; error: "not-found" | "invalid-auth" | "invalid-avatar" }
> =>
  apiClient({
    endpoint: "setAvatar",
    payload: await buildSignedRequest(
      params.credentials,
      "setAvatar",
      { avatar: params.avatar },
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

export const setPriceTagSigned = async (
  params: { priceTag?: number; credentials: Credentials },
): Promise<
  | { success: true }
  | { success: false; error: "not-found" | "invalid-auth" }
> =>
  apiClient({
    endpoint: "setPriceTag",
    payload: await buildSignedRequest(
      params.credentials,
      "setPriceTag",
      { priceTag: params.priceTag },
    ),
  });

export const getBalanceAndTransactionsSigned = async (
  credentials: Credentials,
): Promise<
  | {
    balance: number;
    transactions: {
      amount: number;
      type: string;
      timestamp: number;
      status?: string;
      walletAddress?: string;
    }[];
  }
  | { error: "not-found" | "invalid-auth" }
> =>
  apiClient({
    endpoint: "getBalanceAndTransactions",
    payload: await buildSignedRequest(
      credentials,
      "getBalanceAndTransactions",
      {},
    ),
  });

export const requestPayoutSigned = async (
  params: { amount: number; walletAddress: string; credentials: Credentials },
): Promise<
  | { success: true }
  | {
    success: false;
    error: "not-found" | "invalid-auth" | "insufficient-balance";
  }
> =>
  apiClient({
    endpoint: "requestPayout",
    payload: await buildSignedRequest(
      params.credentials,
      "requestPayout",
      { amount: params.amount, walletAddress: params.walletAddress },
    ),
  });

export const prepareCryptoPaymentSigned = async (
  params: { amount: number; credentials: Credentials },
): Promise<
  | {
    address: string;
    btcAmount: number;
    usdAmount: number;
    qrUrl: string;
  }
  | { error: "not-found" | "invalid-auth" | "missing-secret" }
> =>
  apiClient({
    endpoint: "prepareCryptoPayment",
    payload: await buildSignedRequest(
      params.credentials,
      "prepareCryptoPayment",
      { amount: params.amount },
    ),
  });

export const checkCryptoPaymentSigned = async (
  params: { paymentAddress: string; credentials: Credentials },
): Promise<
  | { success: true; message: string }
  | {
    success: false;
    error:
      | "not-found"
      | "invalid-auth"
      | "not-paid"
      | "already-claimed"
      | "missing-secret";
  }
> =>
  apiClient({
    endpoint: "checkCryptoPayment",
    payload: await buildSignedRequest(
      params.credentials,
      "checkCryptoPayment",
      { paymentAddress: params.paymentAddress },
    ),
  });

export const getProfile = (
  publicSignKey: string,
): Promise<
  {
    profile: {
      name?: string;
      avatar?: string;
      alias?: string;
      priceTag?: number;
    } | null;
  }
> => apiClient({ endpoint: "getProfile", payload: { publicSignKey } });

const buildOptionalCallerAuth = async <T>(
  credentials: Credentials | undefined,
  action: string,
  payload: T,
) => {
  if (
    !credentials ||
    !(await canSignWithPrivateKey(credentials.privateSignKey))
  ) {
    return undefined;
  }
  const signed = await buildSignedRequest(credentials, action, payload);
  return {
    publicSignKey: credentials.publicSignKey,
    nonce: signed.nonce,
    authToken: signed.authToken,
  };
};

export const getConversations = async (
  publicSignKeys: string[],
  credentials?: Credentials,
): Promise<
  {
    conversations: {
      id: string;
      title: string;
      participants: { publicSignKey: string }[];
    }[];
  }
> => {
  const resolved = credentials ??
    publicSignKeys
      .map(lookupRegisteredCredentials)
      .find((c): c is Credentials => Boolean(c));
  const auth = await buildOptionalCallerAuth(
    resolved,
    "getConversations",
    { publicSignKeys },
  );
  return apiClient({
    endpoint: "getConversations",
    payload: { publicSignKeys, ...(auth ? { auth } : {}) },
  });
};

export const getConversationInfo = async (
  conversationId: string,
  credentials?: Credentials,
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
      hasCanvas: boolean;
    };
  }
  | { error: "not-found" }
> => {
  const auth = await buildOptionalCallerAuth(
    credentials,
    "getConversationInfo",
    { conversationId },
  );
  return apiClient({
    endpoint: "getConversationInfo",
    payload: { conversationId, ...(auth ? { auth } : {}) },
  });
};

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

export const storeTransferPayload = (
  encryptedPayload: string,
): Promise<{ relayId: string }> =>
  apiClient({
    endpoint: "storeTransferPayload",
    payload: { encryptedPayload },
  });

export const retrieveTransferPayload = (
  relayId: string,
): Promise<{ encryptedPayload: string } | { error: "not-found" }> =>
  apiClient({ endpoint: "retrieveTransferPayload", payload: { relayId } });

export const heartbeatSigned = async (
  credentials: Credentials,
): Promise<{ success: true }> =>
  apiClient({
    endpoint: "heartbeat",
    payload: await buildSignedRequest(credentials, "heartbeat", {}),
  });

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

export const renameConversationSigned = async (
  { conversationId, title, credentials }: {
    conversationId: string;
    title: string;
    credentials: Credentials;
  },
): Promise<
  | { success: true }
  | {
    success: false;
    error: "not-found" | "invalid-auth" | "not-admin" | "invalid-title";
  }
> =>
  apiClient({
    endpoint: "renameConversation",
    payload: await buildSignedRequest(credentials, "renameConversation", {
      conversationId,
      title,
    }),
  });

export type GetMessagesResult =
  | {
    messages: Array<{ id: string; payload: unknown; timestamp: number }>;
    hasMore: boolean;
  }
  | { error: "not-participant" | "invalid-auth" };

export const getMessagesSigned = async ({
  conversationId,
  limit,
  before,
  credentials,
}: {
  conversationId: string;
  limit?: number;
  before?: number;
  credentials: Credentials;
}): Promise<GetMessagesResult> =>
  apiClient({
    endpoint: "getMessages",
    payload: await buildSignedRequest(credentials, "getMessages", {
      conversationId,
      ...(limit !== undefined ? { limit } : {}),
      ...(before !== undefined ? { before } : {}),
    }),
  });

export const saveCanvasSigned = async ({
  conversationId,
  encrypted,
  expectedVersion,
  credentials,
}: {
  conversationId: string;
  encrypted: string;
  expectedVersion: number;
  credentials: Credentials;
}) =>
  apiClient({
    endpoint: "saveCanvas",
    payload: await buildSignedRequest(credentials, "saveCanvas", {
      conversationId,
      encrypted,
      expectedVersion,
    }),
  });

export const mintInstantTokenSigned = async (
  credentials: Credentials,
): Promise<
  | { token: string; instantEmail: string }
  | { error: "invalid-auth" | "not-found" }
> =>
  apiClient({
    endpoint: "mintInstantToken",
    payload: await buildSignedRequest(credentials, "mintInstantToken", {}),
  });

export const getCanvasRow = async (
  conversationId: string,
  credentials?: Credentials,
): Promise<{
  row: { id: string; encrypted: string; version: number } | null;
}> => {
  const auth = await buildOptionalCallerAuth(
    credentials,
    "getCanvasRow",
    { conversationId },
  );
  return apiClient({
    endpoint: "getCanvasRow",
    payload: { conversationId, ...(auth ? { auth } : {}) },
  });
};
