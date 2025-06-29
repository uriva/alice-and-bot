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
  type Credentials,
  instantAppId,
} from "./protocol/src/api.ts";

export { setWebhook } from "./backend/src/api.ts";
export {
  chatWithMeLink,
  createIdentity,
  type Credentials,
  handleWebhookUpdate,
  sendMessage,
  type WebhookUpdate,
} from "./protocol/src/api.ts";
export { Widget } from "./widget/src/widget.tsx";

let db: InstantReactWebDatabase<typeof schema> | null = null;

const accessDb = (): InstantReactWebDatabase<typeof schema> => {
  if (!db) {
    db = init({ appId: instantAppId, schema, devtool: false });
  }
  return db;
};

export const useGetOrCreateConversation: (
  { publicSignKey }: Credentials,
  participants: string[],
) => string | null = useGetOrCreateConversationNoDb(accessDb);

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
