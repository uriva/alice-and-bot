import { Encrypted, encryptMessage } from "./crypto.ts";
import { id, type InstantReactWebDatabase } from "@instantdb/react";
import schema from "./instant.schema.ts";

const url = "https://alice-and-bot-notification-service.deno.dev";

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

export const sendMessage = async (
  { transact, tx }: InstantReactWebDatabase<typeof schema>,
  publicKey: string,
  payload: MessagePayload,
  conversationId: string,
) => {
  const messageId = id();
  await transact(
    tx.messages[messageId].update({
      payload: await encryptMessage(publicKey, payload),
      timestamp: Date.now(),
    }).link({ conversation: conversationId }),
  );
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messageId }),
  });
  return messageId;
};
