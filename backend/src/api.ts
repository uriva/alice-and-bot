import { apiClient as apiClientMaker, httpCommunication } from "typed-api";

import { z } from "zod";
import { endpoint } from "typed-api";

const createConversationOutputZod = z.union([
  z.object({ conversationId: z.string() }),
  z.object({
    error: z.enum(["invalid-participants", "must-own-an-identity"]),
  }),
]);

export type CreateConversationOutput = z.infer<
  typeof createConversationOutputZod
>;

export const backendApiSchema = {
  createConversation: endpoint({
    authRequired: false,
    input: z.object({
      publicSignKeyToEncryptedSymmetricKey: z.record(z.string(), z.string()),
      title: z.string(),
    }),
    output: createConversationOutputZod,
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
  notify: endpoint({
    authRequired: false,
    input: z.object({ messageId: z.string() }),
    output: z.object({}),
  }),
  setWebhook: endpoint({
    authRequired: true,
    input: z.object({
      url: z.string(),
      publicSignKey: z.string(),
    }),
    output: z.union([
      z.object({ success: z.literal(true) }),
      z.object({
        success: z.literal(false),
        error: z.literal("identity-does-not-exist-or-not-owned"),
      }),
    ]),
  }),
} as const;

export type backendApi = typeof backendApiSchema;

export const apiClient = apiClientMaker(
  httpCommunication("https://alice-and-bot.deno.dev"),
  backendApiSchema,
);
