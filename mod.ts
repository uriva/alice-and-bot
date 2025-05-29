import type { InstantReactWebDatabase } from "@instantdb/react";
import { init } from "@instantdb/react";
import type { JSX } from "preact";
import {
  useConversations as useConversationsNoDb,
  useGetOrCreateConversation as useGetOrCreateConversationNoDb,
} from "./clients/react/src/hooks.ts";
import { Chat as ChatNoDb, type ChatProps } from "./clients/react/src/main.tsx";
import schema from "./instant.schema.ts";
import {
  createConversation as createConversationNoDb,
  instantAppId
} from "./protocol/src/api.ts";

export { setWebhook } from "./backend/src/api.ts";
export {
  createIdentity, handleWebhookUpdate,
  sendMessage, type Credentials, type WebhookUpdate
} from "./protocol/src/api.ts";

let db: InstantReactWebDatabase<typeof schema> | null = null;

const accessDb = (): InstantReactWebDatabase<typeof schema> => {
  if (!db) {
    db = init({ appId: instantAppId, schema, devtool: false });
  }
  return db;
};

export const useGetOrCreateConversation = useGetOrCreateConversationNoDb(accessDb);

export const useConversations: (publicSignKey: string) => {
  id: string;
  title: string;
  participants: {
    publicSignKey: string;
  }[];
}[] = useConversationsNoDb(accessDb);
export const Chat: (
  { credentials, conversationId, onClose }: ChatProps,
) => JSX.Element = ChatNoDb(accessDb);

export const createConversation: (
  publicSignKeys: string[],
  conversationTitle: string,
) => Promise<{ conversationId: string } | { error: string }> =
  createConversationNoDb(accessDb);
