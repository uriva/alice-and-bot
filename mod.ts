import { init } from "@instantdb/react";
import {
  apiClient,
  type CreateConversationOutput,
  type SetWebhookOutput,
} from "./backend/src/api.ts";
import { useConversations as useConversationsNoDb } from "./clients/react/src/hooks.ts";
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

const db = init({ appId: instantAppId, schema, devtool: false });

export const useConversations = useConversationsNoDb(db);
export const Chat = ChatNoDb(db);

export const createConversation: (
  publicSignKeys: string[],
  conversationTitle: string,
) => Promise<CreateConversationOutput> = createConversationNoDb(db);

export const setWebhook = (
  { url, credentials: { publicSignKey } }: {
    url: string;
    credentials: Credentials;
  },
): Promise<SetWebhookOutput> =>
  apiClient({ endpoint: "setWebhook", payload: { url, publicSignKey } });
