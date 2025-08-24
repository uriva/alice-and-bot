import type { User } from "@instantdb/core";
import {
  apiClient as apiClientMaker,
  type ApiImplementation,
  endpoint,
  httpCommunication,
} from "typed-api";
import { z } from "zod/v4";
import type { Credentials } from "../../protocol/src/api.ts";
import { hash } from "gamla";

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
  setAlias: endpoint({
    authRequired: false,
    input: z.object({
      payload: z.object({ alias: z.string() }),
      publicSignKey: z.string(),
      nonce: z.string(),
      authToken: z.string(),
    }),
    output: z.union([
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
  }),
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
    }),
    output: z.object({}),
  }),
  createIdentity: endpoint({
    authRequired: true,
    input: z.object({
      publicSignKey: z.string(),
      publicEncryptKey: z.string(),
    }),
    output: z.object({}),
  }),
  sendMessage: endpoint({
    authRequired: false,
    input: z.object({ encryptedMessage: z.string(), conversation: z.string() }),
    output: z.object({ messageId: z.string() }),
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
