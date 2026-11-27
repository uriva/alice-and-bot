import { empty } from "@uri/gamla";
import webpush from "web-push";
import type { PushSubscriptionJSON } from "../../instant.schema.ts";
import type {
  ConversationInfo,
  EncryptedConversationKey,
  EncryptedMessage,
  WebhookUpdate,
} from "../../protocol/src/clientApi.ts";
import { signWebhookOrigin } from "../../protocol/src/webhookAuth.ts";
import {
  applyPushSubscriptionMutations,
  type CachedConversation,
  cacheIdentity,
  getCachedConversation,
  getCachedPushSubscriptionsForIdentities,
  peekCachedIdentityByPublicSignKey,
  peekCachedPushSubscriptions,
  setCachedPushSubscriptions,
  type StoredPushRow,
} from "./cache.ts";
import { query, transact, tx } from "./db.ts";
import { fetchSafeWebhook, isSafeWebhookUrl } from "./ssrfGuard.ts";

const relayWebhookPattern = /\/relay\/webhook\/([^/]+)$/;

const extractRelayToken = (url: string) => url.match(relayWebhookPattern)?.[1];

export const fetchWebhookConversation = async (
  conversationId: string,
): Promise<{ conversations: CachedConversation[] }> => {
  const conversation = await getCachedConversation(conversationId);
  return { conversations: conversation ? [conversation] : [] };
};

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
    conversation.participants.map((p) => (p.webhook ? "[configured]" : null)),
  );
  const rawParticipants = conversation.participants;
  const limited = rawParticipants.slice(0, 10);
  const conversationInfo: ConversationInfo = {
    participants: limited.map((p) => ({
      publicSignKey: p.publicSignKey,
      name: p.name,
      avatar: p.avatar,
      alias: p.alias,
    })),
    isPartial: rawParticipants.length > limited.length,
    hasCanvas: conversation.hasCanvas,
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
    conversation.participants.map((p) => {
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

type PushDeliveryOutcome =
  | { kind: "delete"; sub: StoredPushRow }
  | { kind: "delivered"; sub: StoredPushRow }
  | { kind: "noop" };

const deliverPushSubscription =
  (payloadJson: string) =>
  async (sub: StoredPushRow): Promise<PushDeliveryOutcome> => {
    if (!isSafeWebhookUrl(sub.subscription.endpoint)) {
      console.warn("Blocked unsafe push endpoint:", sub.subscription.endpoint);
      return { kind: "noop" };
    }
    const details = webpush.generateRequestDetails(
      {
        endpoint: sub.subscription.endpoint,
        keys: sub.subscription.keys,
      },
      payloadJson,
      pushUrgencyOptions,
    );
    if (!isSafeWebhookUrl(details.endpoint)) return { kind: "noop" };
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
      return { kind: "delete", sub };
    }
    if (res && res.status >= 200 && res.status < 300) {
      return { kind: "delivered", sub };
    }
    return { kind: "noop" };
  };

const commitPushDeliveryOutcomes = async (
  outcomes: PushDeliveryOutcome[],
  nextSubscriptionOnDelivery: (
    sub: StoredPushRow,
  ) => PushSubscriptionJSON | null,
) => {
  const deletedIds = new Set<string>();
  const updatedById = new Map<string, PushSubscriptionJSON>();
  const affectedOwnerIds = new Set<string>();
  const chunks = outcomes.flatMap((outcome) => {
    if (outcome.kind === "delete") {
      deletedIds.add(outcome.sub.id);
      if (outcome.sub.owner?.id) affectedOwnerIds.add(outcome.sub.owner.id);
      return [tx.pushSubscriptions[outcome.sub.id].delete()];
    }
    if (outcome.kind === "delivered") {
      const nextSub = nextSubscriptionOnDelivery(outcome.sub);
      if (!nextSub) return [];
      updatedById.set(outcome.sub.id, nextSub);
      if (outcome.sub.owner?.id) affectedOwnerIds.add(outcome.sub.owner.id);
      return [
        tx.pushSubscriptions[outcome.sub.id].update({
          subscription: nextSub,
        }),
      ];
    }
    return [];
  });
  if (chunks.length > 0) {
    await transact(chunks);
    applyPushSubscriptionMutations({
      deletedIds,
      updatedById,
      affectedOwnerIds,
    });
  }
};

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
  const conversation = conversations[0];
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
  const pushSubscriptions = await getCachedPushSubscriptionsForIdentities(
    recipients.map((r) => r.id),
  );
  const matchingSubscriptions = pushSubscriptions.filter(
    (s) => !s.conversation || s.conversation.id === conversation.id,
  );
  if (empty(matchingSubscriptions)) return {};
  const isGroupChat = conversation.participants.length > 2;
  const outcomes = await Promise.all(
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
      return deliverPushSubscription(payloadJson)(sub);
    }),
  );
  await commitPushDeliveryOutcomes(
    outcomes,
    (sub) =>
      (sub.subscription.notifiedConversations ?? []).includes(conversation.id)
        ? null
        : withAddedNotifiedConversation(sub.subscription, conversation.id),
  );
  return {};
};

const fetchPushSubscriptionsForDismiss = async ({
  publicSignKey,
  identityId,
}: {
  publicSignKey: string;
  identityId?: string;
}): Promise<StoredPushRow[]> => {
  if (identityId) {
    const cached = peekCachedPushSubscriptions(identityId);
    if (cached.hit) return cached.value;
    return getCachedPushSubscriptionsForIdentities([identityId]);
  }
  const cachedIdentity = peekCachedIdentityByPublicSignKey(publicSignKey);
  if (cachedIdentity) {
    return getCachedPushSubscriptionsForIdentities([cachedIdentity.id]);
  }
  const { identities } = await query({
    identities: {
      pushSubscriptions: { owner: {}, conversation: {} },
      $: { where: { publicSignKey } },
    },
  });
  if (empty(identities)) return [];
  const rawIdentity = identities[0];
  cacheIdentity({
    id: rawIdentity.id,
    publicSignKey: rawIdentity.publicSignKey,
    ...(rawIdentity.name !== undefined ? { name: rawIdentity.name } : {}),
    ...(rawIdentity.avatar !== undefined ? { avatar: rawIdentity.avatar } : {}),
    ...(rawIdentity.alias !== undefined ? { alias: rawIdentity.alias } : {}),
    ...(rawIdentity.shortId !== undefined
      ? { shortId: rawIdentity.shortId }
      : {}),
    ...(rawIdentity.priceTag !== undefined
      ? { priceTag: rawIdentity.priceTag }
      : {}),
    ...(rawIdentity.webhook !== undefined
      ? { webhook: rawIdentity.webhook }
      : {}),
    ...(rawIdentity.instantEmail !== undefined
      ? { instantEmail: rawIdentity.instantEmail }
      : {}),
  });
  const normalizedRows: StoredPushRow[] = (
    rawIdentity.pushSubscriptions ?? []
  ).map((row) => ({
    id: row.id,
    subscription: row.subscription,
    owner: { id: rawIdentity.id },
    ...(row.conversation ? { conversation: { id: row.conversation.id } } : {}),
  }));
  setCachedPushSubscriptions(rawIdentity.id, normalizedRows);
  return normalizedRows;
};

export const dismissPushForParticipant = async ({
  conversationId,
  publicSignKey,
  identityId,
  excludeEndpoint,
}: {
  conversationId: string;
  publicSignKey: string;
  identityId?: string;
  excludeEndpoint?: string;
}) => {
  const pushSubscriptions = await fetchPushSubscriptionsForDismiss({
    publicSignKey,
    identityId,
  });
  const activeSubs = pushSubscriptions.filter(
    (s) =>
      s.subscription.endpoint !== excludeEndpoint &&
      (s.subscription.notifiedConversations ?? []).includes(conversationId),
  );
  if (empty(activeSubs)) return {};
  ensureVapidConfigured();
  const payloadJson = JSON.stringify({
    type: "dismiss",
    conversationId,
    timestamp: Date.now(),
  });
  const outcomes = await Promise.all(
    activeSubs.map(deliverPushSubscription(payloadJson)),
  );
  await commitPushDeliveryOutcomes(
    outcomes,
    (sub) => withRemovedNotifiedConversation(sub.subscription, conversationId),
  );
  return {};
};
