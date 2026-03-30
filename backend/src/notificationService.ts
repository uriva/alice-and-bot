import { coerce } from "@uri/gamla";
import webpush from "web-push";
import type {
  EncryptedMessage,
  WebhookUpdate,
} from "../../protocol/src/clientApi.ts";
import { query, transact, tx } from "./db.ts";

const relayWebhookPattern = /\/relay\/webhook\/([^/]+)$/;

const extractRelayToken = (url: string) => url.match(relayWebhookPattern)?.[1];

export const callWebhooks = async (
  { messageId, conversationId, payload, timestamp, storeLocalRelay }: {
    messageId: string;
    conversationId: string;
    payload: EncryptedMessage;
    timestamp: number;
    storeLocalRelay: (token: string, body: unknown) => Promise<void>;
  },
) => {
  const { conversations } = await query({
    conversations: {
      participants: {},
      $: { where: { id: conversationId } },
    },
  });
  if (!conversations.length) return {};
  const conversation = conversations[0];
  const webhooks = conversation.participants.map((p: { webhook?: string }) =>
    p.webhook
  );
  console.log("callWebhooks: webhooks", webhooks);
  const update: WebhookUpdate = {
    conversationId,
    payload,
    timestamp,
    messageId,
  };
  await Promise.all(
    webhooks.map((webhook) => {
      if (!webhook) return Promise.resolve();
      const relayToken = extractRelayToken(webhook);
      if (relayToken) return storeLocalRelay(relayToken, update);
      return fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      }).catch((e) => {
        console.error("Failed to call webhook", webhook, e);
      });
    }),
  );
  return {};
};

type Participant = { publicSignKey: string; webhook?: string };
type Conversation = { id: string; title: string; participants: Participant[] };

export const vapidPublicKey = coerce(Deno.env.get("VAPID_PUBLIC_KEY"));

const vapidPrivateKey = coerce(Deno.env.get("VAPID_PRIVATE_KEY"));
webpush.setVapidDetails(
  "mailto:support@aliceandbot.com",
  vapidPublicKey,
  vapidPrivateKey,
);

export const sendPushToParticipants = async (
  { messageId: _messageId, conversationId, timestamp }: {
    messageId?: string;
    conversationId: string;
    timestamp: number;
  },
) => {
  const { conversations } = await query({
    conversations: {
      participants: {},
      $: { where: { id: conversationId } },
    },
  });
  if (!conversations.length) return {};
  const conversation = coerce<Conversation>(conversations[0]);
  const participantKeys = conversation.participants.map((p) => p.publicSignKey);
  const { identities } = await query({
    identities: { $: { where: { publicSignKey: { $in: participantKeys } } } },
  });
  const activeThreshold = Date.now() - 60_000;
  const inactiveIdentities = identities.filter(
    (i: { lastActiveAt?: number }) =>
      !i.lastActiveAt || i.lastActiveAt < activeThreshold,
  );
  if (inactiveIdentities.length === 0) return {};
  const { pushSubscriptions } = await query({
    pushSubscriptions: {
      owner: {},
      conversation: {},
      $: {
        where: { "owner.id": { $in: inactiveIdentities.map((i) => i.id) } },
      },
    },
  });
  const payload = {
    type: "message",
    conversationId: conversation.id,
    conversationTitle: conversation.title,
    timestamp,
  };
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
