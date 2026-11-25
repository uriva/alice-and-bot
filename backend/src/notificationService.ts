import { coerce, empty } from "@uri/gamla";
import webpush from "web-push";
import type { PushSubscriptionJSON } from "../../instant.schema.ts";
import type {
  ConversationInfo,
  EncryptedConversationKey,
  EncryptedMessage,
  WebhookUpdate,
} from "../../protocol/src/clientApi.ts";
import { signWebhookOrigin } from "../../protocol/src/webhookAuth.ts";
import { query, transact, tx } from "./db.ts";
import { fetchSafeWebhook, isSafeWebhookUrl } from "./ssrfGuard.ts";

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
    conversation.participants.map((p: { webhook?: string }) =>
      p.webhook ? "[configured]" : null
    ),
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
  const signingKey = (Deno.env.get("WEBHOOK_SIGNING_PRIVATE_KEY") ?? "").trim();
  const serverSignature = signingKey
    ? await signWebhookOrigin(signingKey, {
      messageId,
      conversationId,
      timestamp,
      payload,
    })
    : undefined;
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
        ...(serverSignature ? { serverSignature } : {}),
      };
      const relayToken = extractRelayToken(webhook);
      if (relayToken) return storeLocalRelay(relayToken, update);
      if (!isSafeWebhookUrl(webhook)) {
        console.warn("Blocked unsafe webhook URL:", webhook);
        return Promise.resolve();
      }
      const freshTrace = `00-${
        crypto.randomUUID().replace(/-/g, "")
      }-0000000000000001-01`;
      return fetchSafeWebhook(webhook, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "traceparent": freshTrace,
          "X-Alice-Timestamp": String(timestamp),
          "X-Alice-Message-Id": messageId,
          ...(serverSignature ? { "X-Alice-Signature": serverSignature } : {}),
        },
        body: JSON.stringify(update),
      }).catch((e) => {
        console.error("Failed to call webhook", webhook, e);
      });
    }),
  );
  return {};
};

type PushParticipant = {
  id: string;
  publicSignKey: string;
  name?: string;
  avatar?: string;
  webhook?: string;
  keys?: { key: EncryptedConversationKey }[];
};
type Conversation = {
  id: string;
  title: string;
  participants: PushParticipant[];
};

const maxInlinePushPayloadBytes = 3500;
const maxTrackedNotifiedConversations = 64;
const maxAvatarUrlLength = 512;
const textEncoder = new TextEncoder();

const isHttpAvatarUrl = (avatar?: string): avatar is string =>
  Boolean(
    avatar &&
      avatar.length <= maxAvatarUrlLength &&
      (avatar.startsWith("https://") || avatar.startsWith("http://")),
  );

const withAddedNotifiedConversation = (
  sub: PushSubscriptionJSON,
  conversationId: string,
): PushSubscriptionJSON => ({
  ...sub,
  notifiedConversations: [
    ...(sub.notifiedConversations ?? []).filter((c) => c !== conversationId),
    conversationId,
  ].slice(-maxTrackedNotifiedConversations),
});

const withRemovedNotifiedConversation = (
  sub: PushSubscriptionJSON,
  conversationId: string,
): PushSubscriptionJSON => ({
  ...sub,
  notifiedConversations: (sub.notifiedConversations ?? []).filter(
    (c) => c !== conversationId,
  ),
});

const buildMessagePushPayloadJson = ({
  messageId,
  conversationId,
  conversationTitle,
  senderName,
  senderAvatar,
  senderPublicSignKey,
  isGroupChat,
  conversationKey,
  encryptedMessage,
  timestamp,
}: {
  messageId?: string;
  conversationId: string;
  conversationTitle: string;
  senderName?: string;
  senderAvatar?: string;
  senderPublicSignKey?: string;
  isGroupChat: boolean;
  conversationKey?: EncryptedConversationKey;
  encryptedMessage?: string;
  timestamp: number;
}) => {
  const base = {
    type: "message" as const,
    ...(messageId ? { messageId } : {}),
    conversationId,
    conversationTitle,
    ...(senderName ? { senderName } : {}),
    ...(isHttpAvatarUrl(senderAvatar) ? { senderAvatar } : {}),
    ...(senderPublicSignKey ? { senderPublicSignKey } : {}),
    isGroupChat,
    ...(conversationKey ? { conversationKey } : {}),
    timestamp,
  };
  if (!encryptedMessage) return JSON.stringify(base);
  const withCiphertext = JSON.stringify({ ...base, encryptedMessage });
  return textEncoder.encode(withCiphertext).byteLength <=
      maxInlinePushPayloadBytes
    ? withCiphertext
    : JSON.stringify(base);
};

export const getVapidPublicKey = () => Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
export const vapidPublicKey = getVapidPublicKey();

const vapidState = { lastConfigured: "" };

const ensureVapidConfigured = () => {
  const pub = getVapidPublicKey();
  const priv = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
  const pair = `${pub}:${priv}`;
  if (!pub || !priv || pair === vapidState.lastConfigured) return;
  try {
    webpush.setVapidDetails("mailto:support@aliceandbot.com", pub, priv);
    vapidState.lastConfigured = pair;
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

type StoredPushRow = {
  id: string;
  subscription: PushSubscriptionJSON;
  owner?: { id: string };
  conversation?: { id: string };
};

const deliverPushSubscription = (
  payloadJson: string,
  onDelivered?: (sub: StoredPushRow) => Promise<unknown>,
) =>
async (sub: StoredPushRow) => {
  if (!isSafeWebhookUrl(sub.subscription.endpoint)) {
    console.warn("Blocked unsafe push endpoint:", sub.subscription.endpoint);
    return;
  }
  const details = webpush.generateRequestDetails(
    {
      endpoint: sub.subscription.endpoint,
      keys: sub.subscription.keys,
    },
    payloadJson,
    pushUrgencyOptions,
  );
  if (!isSafeWebhookUrl(details.endpoint)) return;
  const res = await fetchSafeWebhook(
    details.endpoint,
    {
      method: details.method,
      headers: toFetchHeaders(details.headers),
      body: details.body ? new Uint8Array(details.body) : undefined,
    },
    { allowRedirects: false },
  ).catch((err) => {
    console.error("Failed to send web push", err);
    return null;
  });
  if (res && (res.status === 404 || res.status === 410)) {
    await transact(tx.pushSubscriptions[sub.id].delete());
    return;
  }
  if (res && res.status >= 200 && res.status < 300 && onDelivered) {
    await onDelivered(sub);
  }
};

const recordNotifiedConversation =
  (conversationId: string) => (sub: StoredPushRow) =>
    (sub.subscription.notifiedConversations ?? []).includes(conversationId)
      ? Promise.resolve()
      : transact(
        tx.pushSubscriptions[sub.id].update({
          subscription: withAddedNotifiedConversation(
            sub.subscription,
            conversationId,
          ),
        }),
      );

const clearNotifiedConversation =
  (conversationId: string) => (sub: StoredPushRow) =>
    transact(
      tx.pushSubscriptions[sub.id].update({
        subscription: withRemovedNotifiedConversation(
          sub.subscription,
          conversationId,
        ),
      }),
    );

export const sendPushToParticipants = async (
  {
    messageId,
    conversationId,
    encryptedMessage,
    timestamp,
    senderPublicSignKey,
    prefetchedConversations,
  }: {
    messageId?: string;
    conversationId: string;
    encryptedMessage?: string;
    timestamp: number;
    senderPublicSignKey?: string;
    prefetchedConversations?: ReturnType<typeof fetchWebhookConversation>;
  },
) => {
  ensureVapidConfigured();
  const { conversations } = await (prefetchedConversations ??
    fetchWebhookConversation(conversationId));
  if (empty(conversations)) return {};
  const conversation = coerce<Conversation>(conversations[0]);
  const sender = senderPublicSignKey
    ? conversation.participants.find(
      (p) => p.publicSignKey === senderPublicSignKey,
    )
    : undefined;
  const recipients = senderPublicSignKey
    ? conversation.participants.filter(
      (p) => p.publicSignKey !== senderPublicSignKey,
    )
    : conversation.participants;
  if (empty(recipients)) return {};
  const recipientById = new Map(recipients.map((r) => [r.id, r]));
  const { pushSubscriptions } = await query({
    pushSubscriptions: {
      owner: {},
      conversation: {},
      $: {
        where: { "owner.id": { $in: recipients.map((r) => r.id) } },
      },
    },
  });
  const matchingSubscriptions = coerce<StoredPushRow[]>(pushSubscriptions)
    .filter((s) => !s.conversation || s.conversation.id === conversation.id);
  const isGroupChat = conversation.participants.length > 2;
  const markDelivered = recordNotifiedConversation(conversation.id);
  await Promise.all(
    matchingSubscriptions.map((sub) => {
      const recipient = sub.owner ? recipientById.get(sub.owner.id) : undefined;
      const payloadJson = buildMessagePushPayloadJson({
        messageId,
        conversationId: conversation.id,
        conversationTitle: conversation.title,
        senderName: sender?.name,
        senderAvatar: sender?.avatar,
        senderPublicSignKey,
        isGroupChat,
        conversationKey: recipient?.keys?.[0]?.key,
        encryptedMessage,
        timestamp,
      });
      return deliverPushSubscription(payloadJson, markDelivered)(sub);
    }),
  );
  return {};
};

export const dismissPushForParticipant = async ({
  conversationId,
  publicSignKey,
  excludeEndpoint,
}: {
  conversationId: string;
  publicSignKey: string;
  excludeEndpoint?: string;
}) => {
  ensureVapidConfigured();
  const { identities } = await query({
    identities: { $: { where: { publicSignKey } } },
  });
  if (empty(identities)) return {};
  const { pushSubscriptions } = await query({
    pushSubscriptions: {
      $: { where: { "owner.id": identities[0].id } },
    },
  });
  const activeSubs = coerce<StoredPushRow[]>(pushSubscriptions).filter(
    (s) =>
      s.subscription.endpoint !== excludeEndpoint &&
      (s.subscription.notifiedConversations ?? []).includes(conversationId),
  );
  if (empty(activeSubs)) return {};
  const payloadJson = JSON.stringify({
    type: "dismiss",
    conversationId,
    timestamp: Date.now(),
  });
  const markCleared = clearNotifiedConversation(conversationId);
  await Promise.all(
    activeSubs.map(deliverPushSubscription(payloadJson, markCleared)),
  );
  return {};
};
