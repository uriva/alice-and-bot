import { init } from "@instantdb/react";
import type { InstantReactWebDatabase } from "@instantdb/react";
import {
  apiClient,
  type CreateConversationOutput,
  type SetWebhookOutput,
} from "./backend/src/api.ts";
import {
  useConversations as useConversationsNoDb,
  useGetOrCreateConversation as useGetOrCreateConversationNoDb,
} from "./clients/react/src/hooks.ts";
import { Chat as ChatNoDb } from "./clients/react/src/main.tsx";
import schema from "./instant.schema.ts";
import {
  createConversation as createConversationNoDb,
  type Credentials,
  instantAppId,
} from "./protocol/src/api.ts";

export {
  createIdentity,
  type Credentials,
  handleWebhookUpdate,
  sendMessage,
  type WebhookUpdate,
} from "./protocol/src/api.ts";

let db: InstantReactWebDatabase<typeof schema> | null = null;

const accessDb = () => {
  if (!db) {
    db = init({ appId: instantAppId, schema, devtool: false });
  }
  return db;
};

export const useGetOrCreateConversation = useGetOrCreateConversationNoDb(
  accessDb,
);

export const useConversations = useConversationsNoDb(accessDb);
export const Chat = ChatNoDb(accessDb);

export const createConversation: (
  publicSignKeys: string[],
  conversationTitle: string,
) => Promise<CreateConversationOutput> = createConversationNoDb(accessDb);

export const setWebhook = (
  { url, credentials: { publicSignKey } }: {
    url: string;
    credentials: Credentials;
  },
): Promise<SetWebhookOutput> =>
  apiClient({ endpoint: "setWebhook", payload: { url, publicSignKey } });
