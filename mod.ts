import { init } from "@instantdb/react";
import type { JSX } from "preact/jsx-runtime";
import { apiClient, type CreateConversationOutput } from "./backend/src/api.ts";
import { Chat as ChatNoDb, type ChatProps } from "./clients/react/src/main.tsx";
import schema from "./instant.schema.ts";
import {
  createConversation as createConversationNoDb,
  instantAppId,
  sendMessage as sendMessageNoDb,
} from "./protocol/src/api.ts";

export { createIdentity } from "./protocol/src/api.ts";

const db = init({ appId: instantAppId, schema });

export const Chat: (cp: ChatProps) => JSX.Element = ChatNoDb(db);
export const sendMessage = sendMessageNoDb(db);
export const createConversation: (
  publicSignKeys: string[],
  conversationTitle: string,
) => Promise<CreateConversationOutput> = createConversationNoDb(db);

export const addWebhook = (payload: { url: string; publicSignKey: string }) =>
  apiClient({ endpoint: "setWebhook", payload });
