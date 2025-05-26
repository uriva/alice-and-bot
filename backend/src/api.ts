import { apiClient as apiClientMaker, httpCommunication } from "typed-api";

import { z } from "zod";
import { endpoint } from "typed-api";

export type CreateConversationOutput = z.infer<
  typeof backendApiSchema.createConversation.output
>;

export type SetWebhookOutput = z.infer<
  typeof backendApiSchema.setWebhook.output
>;

export const backendApiSchema = {
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

export type backendApi = typeof backendApiSchema;

export const apiClient = apiClientMaker(
  httpCommunication("https://alice-and-bot.deno.dev"),
  backendApiSchema,
);
