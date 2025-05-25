import { init } from "@instantdb/react";
import type { JSX } from "preact/jsx-runtime";
import {
  apiClient,
  type CreateConversationOutput,
  type SetWebhookOutput,
} from "./backend/src/api.ts";
import {
  Chat as ChatNoDb,
  type ChatProps,
  useConversations as useConversationsNoDb,
} from "./clients/react/src/main.tsx";
import schema from "./instant.schema.ts";
import {
  createConversation as createConversationNoDb,
  type Credentials,
  type DecipheredMessage,
  handleWebhookUpdate as handleWebhookUpdateNoDb,
  instantAppId,
  sendMessage as sendMessageNoDb,
  type SendMessageParams,
  type WebhookUpdate,
} from "./protocol/src/api.ts";

export {
  createIdentity,
  type Credentials,
  type WebhookUpdate,
} from "./protocol/src/api.ts";

const db = init({ appId: instantAppId, schema });

export const useConversations = useConversationsNoDb(db);

export const handleWebhookUpdate: (
  whUpdate: WebhookUpdate,
  credentials: Credentials,
) => Promise<
  {
    conversationId: string;
    conversationKey: string;
    message: DecipheredMessage;
  }
> = handleWebhookUpdateNoDb(db);

export const Chat: (cp: ChatProps) => JSX.Element = ChatNoDb(db);

export const sendMessage: (params: SendMessageParams) => Promise<string> =
  sendMessageNoDb(db);

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
