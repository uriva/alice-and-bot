import { Encrypted } from "./crypto.ts";

export type MessagePayload = {
  type: "text";
  authorPublicKey: string;
  text: string;
};

export type WebhookSentUpdate = {
  payload: Encrypted<MessagePayload>;
  timestamp: number;
  conversationId: string;
};
