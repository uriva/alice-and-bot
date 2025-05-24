import { init } from "@instantdb/react";
import schema from "./instant.schema.ts";
import {
  createConversation as createConversationNoDb,
  instantAppId,
  sendMessage as sendMessageNoDb,
} from "./protocol/src/api.ts";

import { Chat as ChatNoDb } from "./clients/react/src/main.tsx";
export { createIdentity } from "./protocol/src/api.ts";

const db = init({ appId: instantAppId, schema });

export const Chat = ChatNoDb(db);
export const sendMessage = sendMessageNoDb(db);
export const createConversation = createConversationNoDb(db);

export const addWebhook = async (url: string, publicSignKey: string) => {
  throw new Error("Not yet implemented");
};
