import type { User } from "@instantdb/core";
import {
  apiClient as apiClientMaker,
  type ApiImplementation,
  endpoint,
  httpCommunication,
} from "typed-api";
import { z } from "zod/v4";
import type { Credentials } from "../../protocol/src/api.ts";

export const backendApiSchema = {
  aliasToPublicSignKey: endpoint({
    authRequired: false,
    input: z.object({ alias: z.string() }),
    output: z.union([
      z.object({ publicSignKey: z.string() }),
      z.object({ error: z.enum(["no-such-alias"]) }),
    ]),
  }),
  setAlias: endpoint({
    authRequired: true,
    input: z.object({ alias: z.string(), publicSignKey: z.string() }),
    output: z.union([
      z.object({ success: z.literal(true) }),
      z.object({
        success: z.literal(false),
        error: z.enum([
          "alias-taken",
          "invalid-alias",
          "not-owner",
          "not-found",
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
