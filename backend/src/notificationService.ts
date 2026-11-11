import { coerce } from "@uri/gamla";
import webpush from "web-push";
import type {
  ConversationInfo,
  EncryptedConversationKey,
  EncryptedMessage,
  WebhookUpdate,
} from "../../protocol/src/clientApi.ts";
import { query, transact, tx } from "./db.ts";

const relayWebhookPattern = /\/relay\/webhook\/([^/]+)$/;

const extractRelayToken = (url: string) => url.match(relayWebhookPattern)?.[1];

export const fetchWebhookConversation = (conversationId: string) =>
  query({
    conversations: {
      participants: {
        keys: {
          $: { where: { conversation: conversationId } },
        },
      },
      canvas: {},
      $: { where: { id: conversationId } },
    },
  });

export const callWebhooks = async (
  {
    messageId,
    conversationId,
    payload,
    timestamp,
    storeLocalRelay,
    prefetchedConversations,
  }: {
    messageId: string;
    conversationId: string;
    payload: EncryptedMessage;
    timestamp: number;
    storeLocalRelay: (token: string, body: unknown) => Promise<void>;
    prefetchedConversations?: ReturnType<typeof fetchWebhookConversation>;
  },
) => {
  const { conversations } = await (prefetchedConversations ??
    fetchWebhookConversation(conversationId));
  if (!conversations.length) return {};
  const conversation = conversations[0];
  console.log(
    "callWebhooks: webhooks",
    conversation.participants.map((p: { webhook?: string }) => p.webhook),
  );
  const rawParticipants = conversation.participants;
  const limited = rawParticipants.slice(0, 10);
  const conversationInfo: ConversationInfo = {
    participants: limited.map((p: {
      publicSignKey: string;
      name?: string;
      avatar?: string;
      alias?: string;
    }) => ({
      publicSignKey: p.publicSignKey,
      name: p.name,
      avatar: p.avatar,
      alias: p.alias,
    })),
    isPartial: rawParticipants.length > limited.length,
    hasCanvas: Boolean(
      conversation.canvas &&
        (Array.isArray(conversation.canvas)
          ? conversation.canvas.length > 0
          : true),
    ),
  };
  await Promise.all(
    conversation.participants.map((p: {
      webhook?: string;
      keys?: { key: EncryptedConversationKey }[];
    }) => {
      const webhook = p.webhook;
      if (!webhook) return Promise.resolve();
      const update: WebhookUpdate = {
        conversationId,
        payload,
        timestamp,
        messageId,
        conversationInfo,
        ...(p.keys?.length ? { conversationKey: p.keys[0].key } : {}),
      };
      const relayToken = extractRelayToken(webhook);
      if (relayToken) return storeLocalRelay(relayToken, update);
      const freshTrace = `00-${
        crypto.randomUUID().replace(/-/g, "")
      }-0000000000000001-01`;
      return fetch(webhook, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "traceparent": freshTrace,
        },
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

export const getVapidPublicKey = () => Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
export const vapidPublicKey = getVapidPublicKey();

let lastVapidConfigured = "";

const ensureVapidConfigured = () => {
  const pub = getVapidPublicKey();
  const priv = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
  const pair = `${pub}:${priv}`;
  if (!pub || !priv || pair === lastVapidConfigured) return;
  try {
    webpush.setVapidDetails("mailto:support@aliceandbot.com", pub, priv);
    lastVapidConfigured = pair;
  } catch (e) {
    console.warn(
      "VAPID details registration skipped:",
      e instanceof Error ? e.message : e,
    );
  }
};

const pushUrgencyOptions = { urgency: "high" as const, TTL: 86400 };

const toFetchHeaders = (headers: Record<string, string | number>) =>
  Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k, String(v)]),
  );

const deliverPushSubscription = (payloadJson: string) =>
async (sub: {
  id: string;
  subscription: webpush.PushSubscription;
}) => {
  const details = webpush.generateRequestDetails(
    sub.subscription,
    payloadJson,
    pushUrgencyOptions,
  );
  const res = await fetch(details.endpoint, {
    method: details.method,
    headers: toFetchHeaders(details.headers),
    body: details.body ? new Uint8Array(details.body) : undefined,
  }).catch((err) => {
    console.error("Failed to send web push", err);
    return null;
  });
  if (res && (res.status === 404 || res.status === 410)) {
    await transact(tx.pushSubscriptions[sub.id].delete());
  }
};

export const sendPushToParticipants = async (
  {
    messageId: _messageId,
    conversationId,
    timestamp,
    senderPublicSignKey,
  }: {
    messageId?: string;
    conversationId: string;
    timestamp: number;
    senderPublicSignKey?: string;
  },
) => {
  ensureVapidConfigured();
  const { conversations } = await query({
    conversations: {
      participants: {},
      $: { where: { id: conversationId } },
    },
  });
  if (!conversations.length) return {};
  const conversation = coerce<Conversation>(conversations[0]);
  const allKeys = conversation.participants.map((p) => p.publicSignKey);
  const recipientKeys = senderPublicSignKey
    ? allKeys.filter((k) => k !== senderPublicSignKey)
    : allKeys;
  if (recipientKeys.length === 0) return {};
  const { identities } = await query({
    identities: { $: { where: { publicSignKey: { $in: allKeys } } } },
  });
  const senderName = senderPublicSignKey
    ? identities.find((i) => i.publicSignKey === senderPublicSignKey)?.name
    : undefined;
  const recipientIds = identities
    .filter((i) => recipientKeys.includes(i.publicSignKey))
    .map((i) => i.id);
  if (recipientIds.length === 0) return {};
  const { pushSubscriptions } = await query({
    pushSubscriptions: {
      owner: {},
      conversation: {},
      $: {
        where: { "owner.id": { $in: recipientIds } },
      },
    },
  });
  const payloadJson = JSON.stringify({
    type: "message",
    conversationId: conversation.id,
    conversationTitle: conversation.title,
    ...(senderName ? { senderName } : {}),
    timestamp,
  });
  const matchingSubscriptions = pushSubscriptions.filter((s) =>
    !s.conversation || s.conversation.id === conversation.id
  );
  await Promise.all(
    matchingSubscriptions.map(deliverPushSubscription(payloadJson)),
  );
  return {};
};
