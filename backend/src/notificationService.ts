import { coerce } from "gamla";
import webpush from "web-push";
import type { WebhookUpdate } from "../../protocol/src/clientApi.ts";
import { query, transact, tx } from "./db.ts";

export const callWebhooks = async ({ messageId }: { messageId: string }) => {
  const { messages } = await query({
    messages: {
      conversation: { participants: {} },
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

type Participant = { publicSignKey: string; webhook?: string };
type Conversation = { id: string; participants: Participant[] };

export const vapidPublicKey = coerce(Deno.env.get("VAPID_PUBLIC_KEY"));

const vapidPrivateKey = coerce(Deno.env.get("VAPID_PRIVATE_KEY"));
webpush.setVapidDetails(
  "mailto:support@aliceandbot.com",
  vapidPublicKey,
  vapidPrivateKey,
);

export const sendPushToParticipants = async (
  { messageId }: { messageId: string },
) => {
  const { messages } = await query({
    messages: {
      conversation: { participants: {} },
      $: { where: { id: messageId } },
    },
  });
  if (!messages.length) return {};
  const message = messages[0];
  const conversation = coerce<Conversation>(message.conversation);
  const participantKeys = conversation.participants.map((p) => p.publicSignKey);
  const { identities } = await query({
    identities: { $: { where: { publicSignKey: { $in: participantKeys } } } },
  });
  const { pushSubscriptions } = await query({
    pushSubscriptions: {
      owner: {},
      conversation: {},
      $: { where: { "owner.id": { $in: identities.map((i) => i.id) } } },
    },
  });
  const payload = {
    type: "message",
    conversationId: conversation.id,
    timestamp: message.timestamp,
  } as const;
  for (
    const sub of pushSubscriptions.filter((s) =>
      !s.conversation || s.conversation.id === conversation.id
    )
  ) {
    try {
      await webpush.sendNotification(sub.subscription, JSON.stringify(payload));
    } catch (err) {
      const status = (err && (err as { statusCode?: number }).statusCode) ?? 0;
      if (status === 404 || status === 410) {
        await transact(tx.pushSubscriptions[sub.id].delete());
      } else {
        console.error("Failed to send web push", status, err);
      }
    }
  }
  return {};
};
