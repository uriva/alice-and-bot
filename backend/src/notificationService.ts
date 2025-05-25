import { coerce } from "gamla";
import type { WebhookUpdate } from "../../protocol/src/api.ts";
import { query } from "./db.ts";

export const callWebhooks = async ({ messageId }: { messageId: string }) => {
  const { messages } = await query({
    messages: {
      conversation: { participants: { webhooks: {} } },
      $: { where: { id: messageId } },
    },
  });
  if (!messages.length) return {};
  const message = messages[0];
  const conversation = coerce(message.conversation);
  const webhooks = conversation.participants.map(({ webhook }) => webhook);
  const update: WebhookUpdate = {
    conversationId: conversation.id,
    payload: message.payload,
    timestamp: message.timestamp,
  };
  for (const webhook of webhooks) {
    if (!webhook) continue;
    fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    }).catch(() => {
      console.error("Failed to call webhook", webhook);
    });
  }
  return {};
};
