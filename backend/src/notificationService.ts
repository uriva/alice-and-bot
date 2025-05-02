import { coerce } from "gamla";
import { WebhookSentUpdate } from "../../protocol/src/api.ts";
import { query } from "./db.ts";
import { User } from "@instantdb/admin";

export const callWebhooks = async (
  _: User,
  { messageId }: { messageId: string },
) => {
  const { messages } = await query({
    messages: {
      conversation: { participants: { webhooks: {} } },
      $: { where: { id: messageId } },
    },
  });
  if (!messages.length) return {};
  const message = messages[0];
  const conversation = coerce(message.conversation);
  const webhooks = conversation.participants.flatMap(({ webhooks }) =>
    webhooks
  );
  const update: WebhookSentUpdate = {
    conversationId: conversation.id,
    payload: message.payload,
    timestamp: message.timestamp,
  };
  for (const webhook of webhooks) {
    fetch(webhook.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    }).catch(() => {
      console.error("Failed to call webhook", webhook.url);
    });
  }
  return {};
};
