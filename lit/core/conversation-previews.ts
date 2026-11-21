import type { InstaQLEntity } from "@instantdb/core";
import { empty, nonempty, unique } from "@uri/gamla";
import type schema from "../../instant.schema.ts";
import {
  type Credentials,
  type DecipheredMessage,
  decryptMessage,
  type EncryptedConversationKey,
  isSilentMessage,
} from "../../protocol/src/clientApi.ts";
import { decryptAsymmetric } from "../../protocol/src/crypto.ts";
import { registerConversationKeyCredentials } from "../../protocol/src/instantAuth.ts";
import {
  defaultPushKeyStore,
  isStoredPushMessage,
  type PushKeyStore,
} from "../../protocol/src/pushKeyStore.ts";
import { formatMessagePreview } from "../../protocol/src/pushNotification.ts";
import { subscribeAuthedQuery } from "./instant-client.ts";
import {
  cacheDecryptedConversationKey,
  compactPublicKey,
  type Conversation,
  getCachedConversationKey,
  typingTtl,
} from "./subscriptions.ts";

export type ConversationPreview = {
  text: string;
  timestamp: number;
  authorPublicSignKey: string;
  updatedAt: number;
  empty?: boolean;
};

export type TypingParticipant = {
  publicSignKey: string;
  name: string;
  updatedAt: number;
};

export type ConversationTypingMap = Record<string, TypingParticipant[]>;
export type ConversationPreviewMap = Record<string, ConversationPreview>;

export const conversationPreviewsCacheKey =
  "alicebot_conversation_previews_cache";

const previewMessagesLimit = 5;
const maxPriorityConversations = 40;
const maxConcurrentFetches = 6;
const fetchTimeoutMs = 15_000;
const typingRefreshIntervalMs = 5_000;

type DbMessage = InstaQLEntity<typeof schema, "messages">;

type MaybeArray<T> = T | T[] | undefined;

const firstOf = <T>(value: MaybeArray<T>): T | undefined =>
  Array.isArray(value) ? value[0] : value;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isEncryptedKeyStr = (
  value: unknown,
): value is EncryptedConversationKey => typeof value === "string";

const isValidPreview = (value: unknown): value is ConversationPreview =>
  isRecord(value) &&
  typeof value.text === "string" &&
  typeof value.timestamp === "number" &&
  typeof value.authorPublicSignKey === "string" &&
  typeof value.updatedAt === "number";

export const formatPreviewText = (
  message: DecipheredMessage,
): string | null => {
  if (isSilentMessage(message)) return null;
  if (message.type === "call") return "📞 Voice call";
  return formatMessagePreview(message);
};

const sortMessagesDesc = (messages: DecipheredMessage[]) =>
  [...messages].sort((a, b) => b.timestamp - a.timestamp);

export const extractLatestPreview = (
  messages: DecipheredMessage[],
  updatedAt: number,
): ConversationPreview => {
  const match = sortMessagesDesc(messages).find(
    (m) => formatPreviewText(m) !== null,
  );
  if (!match) {
    return {
      text: "",
      timestamp: 0,
      authorPublicSignKey: "",
      updatedAt,
      empty: true,
    };
  }
  return {
    text: formatPreviewText(match) ?? "",
    timestamp: match.timestamp,
    authorPublicSignKey: match.publicSignKey,
    updatedAt,
  };
};

const resolveParticipantDisplayName = (
  publicSignKey: string,
  participants: { publicSignKey: string; name?: string }[],
  nameCache?: Map<string, string | null>,
) =>
  participants
    .find((p) => p.publicSignKey === publicSignKey)
    ?.name?.split("@")[0] ||
  nameCache?.get(publicSignKey) ||
  compactPublicKey(publicSignKey);

export const formatConversationPreviewLine = ({
  preview,
  selfPublicSignKey,
  participants,
  nameCache,
}: {
  preview: ConversationPreview;
  selfPublicSignKey: string;
  participants: { publicSignKey: string; name?: string }[];
  nameCache?: Map<string, string | null>;
}): string | null => {
  if (preview.empty || !preview.text) return null;
  if (preview.authorPublicSignKey === selfPublicSignKey) {
    return `You: ${preview.text}`;
  }
  if (participants.length <= 2) return preview.text;
  return `${
    resolveParticipantDisplayName(
      preview.authorPublicSignKey,
      participants,
      nameCache,
    )
  }: ${preview.text}`;
};

export const activeTypingNamesForConversation = (
  typing: TypingParticipant[] | undefined,
  preview: ConversationPreview | undefined,
  nowMs = Date.now(),
): string[] =>
  unique(
    (typing ?? [])
      .filter((t) => t.updatedAt > 0 && nowMs - t.updatedAt < typingTtl)
      .filter(
        (t) =>
          !(
            preview &&
            !preview.empty &&
            preview.authorPublicSignKey === t.publicSignKey &&
            preview.timestamp >= t.updatedAt
          ),
      )
      .map((t) => t.name)
      .filter(Boolean),
  );

export const formatConversationTypingLabel = (
  typingNames: string[],
  isGroupChat: boolean,
): string | null => {
  if (empty(typingNames)) return null;
  if (!isGroupChat) return "typing…";
  if (typingNames.length === 1) return `${typingNames[0]} is typing…`;
  return `${typingNames.slice(0, 2).join(", ")}${
    typingNames.length > 2 ? " and others" : ""
  } are typing…`;
};

const isSameCalendarDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

export const formatConversationTime = (
  timestamp: number | undefined,
  nowMs = Date.now(),
): string => {
  if (!timestamp || timestamp <= 0) return "";
  const date = new Date(timestamp);
  const now = new Date(nowMs);
  if (isSameCalendarDay(date, now)) {
    return date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  const yesterday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 1,
  );
  if (isSameCalendarDay(date, yesterday)) return "Yesterday";
  const diffDays = (nowMs - timestamp) / 86_400_000;
  if (diffDays > 0 && diffDays < 7) {
    return date.toLocaleDateString([], { weekday: "short" });
  }
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
};

const typingOwnerFields: ("publicSignKey" | "name")[] = [
  "publicSignKey",
  "name",
];
const conversationIdFields: ("id")[] = ["id"];
const descTimestampOrder: { timestamp: "desc" } = { timestamp: "desc" };

export const allTypingStatesQuery = (publicSignKey: string) => ({
  typingStates: {
    $: {
      where: { "conversation.participants.publicSignKey": publicSignKey },
    },
    owner: { $: { fields: typingOwnerFields } },
    conversation: { $: { fields: conversationIdFields } },
  },
});

export const allKeysQuery = (publicSignKey: string) => ({
  keys: {
    $: { where: { "owner.publicSignKey": publicSignKey } },
    conversation: { $: { fields: conversationIdFields } },
  },
});

export const latestMessagesQuery = (conversationId: string) => ({
  messages: {
    $: {
      where: { conversation: conversationId },
      order: descTimestampOrder,
      limit: previewMessagesLimit,
    },
  },
});

type RawTypingRow = {
  updatedAt?: number;
  owner?: MaybeArray<{ publicSignKey?: string; name?: string }>;
  conversation?: MaybeArray<{ id?: string }>;
};

const typingRowsToMap = (
  rows: RawTypingRow[],
  selfPublicSignKey: string,
  nowMs: number,
): ConversationTypingMap => {
  const grouped = new Map<string, TypingParticipant[]>();
  rows.forEach((row) => {
    const conv = firstOf(row.conversation);
    const owner = firstOf(row.owner);
    const updatedAt = row.updatedAt ?? 0;
    if (
      !conv?.id ||
      !owner?.publicSignKey ||
      owner.publicSignKey === selfPublicSignKey ||
      updatedAt <= 0 ||
      nowMs - updatedAt >= typingTtl
    ) {
      return;
    }
    const name = owner.name?.split("@")[0] ||
      compactPublicKey(owner.publicSignKey);
    const list = grouped.get(conv.id) ?? [];
    if (!list.some((p) => p.publicSignKey === owner.publicSignKey)) {
      list.push({ publicSignKey: owner.publicSignKey, name, updatedAt });
      grouped.set(conv.id, list);
    }
  });
  return Object.fromEntries(grouped);
};

const typingMapSignature = (map: ConversationTypingMap) =>
  Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([convId, list]) =>
        `${convId}:${
          list.map((p) => `${p.publicSignKey}@${p.updatedAt}`).join(",")
        }`,
    )
    .join("|");

type SubscribeAllTypingQuery = (
  credentials: Credentials | string,
  query: ReturnType<typeof allTypingStatesQuery>,
  cb: (result: { data?: { typingStates?: RawTypingRow[] } }) => void,
) => () => void;

export const makeSubscribeAllTypingStates =
  (subscribeQuery: SubscribeAllTypingQuery) =>
  (
    credentialsOrKey: Credentials | string,
    onChange: (typingByConversation: ConversationTypingMap) => void,
  ): () => void => {
    const selfPublicSignKey = typeof credentialsOrKey === "string"
      ? credentialsOrKey
      : credentialsOrKey.publicSignKey;
    const state: { latestRows: RawTypingRow[]; lastSignature: string } = {
      latestRows: [],
      lastSignature: "",
    };

    const emit = (force = false) => {
      const next = typingRowsToMap(
        state.latestRows,
        selfPublicSignKey,
        Date.now(),
      );
      const sig = typingMapSignature(next);
      if (!force && sig === state.lastSignature) return;
      state.lastSignature = sig;
      onChange(next);
    };

    const interval = setInterval(() => {
      if (nonempty(state.latestRows)) emit();
    }, typingRefreshIntervalMs);

    const unsubQuery = subscribeQuery(
      credentialsOrKey,
      allTypingStatesQuery(selfPublicSignKey),
      ({ data }) => {
        state.latestRows = data?.typingStates ?? [];
        emit();
      },
    );

    return () => {
      clearInterval(interval);
      unsubQuery();
    };
  };

export const subscribeAllTypingStates = makeSubscribeAllTypingStates(
  (credentialsOrKey, query, cb) =>
    subscribeAuthedQuery(credentialsOrKey, query, cb),
);

type LiveMessagesListener = (
  conversationId: string,
  messages: DecipheredMessage[],
  updatedAt?: number,
) => void;

const liveMessagesListeners = new Set<LiveMessagesListener>();

export const notifyConversationMessages = (
  conversationId: string,
  messages: DecipheredMessage[],
  updatedAt?: number,
) => {
  if (!conversationId) return;
  liveMessagesListeners.forEach((listener) =>
    listener(conversationId, messages, updatedAt)
  );
};

export const readCachedConversationPreviews = (
  publicSignKey: string,
): ConversationPreviewMap => {
  try {
    const raw = globalThis.localStorage?.getItem(conversationPreviewsCacheKey);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (
      !isRecord(parsed) ||
      parsed.publicSignKey !== publicSignKey ||
      !isRecord(parsed.previews)
    ) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed.previews).filter((entry): entry is [
        string,
        ConversationPreview,
      ] => isValidPreview(entry[1])),
    );
  } catch {
    return {};
  }
};

const writeCachedConversationPreviews = (
  publicSignKey: string,
  previews: ConversationPreviewMap,
) => {
  try {
    if (!globalThis.localStorage?.getItem("alicebot_credentials")) return;
    globalThis.localStorage.setItem(
      conversationPreviewsCacheKey,
      JSON.stringify({ publicSignKey, previews }),
    );
  } catch {
    // ignore quota errors
  }
};

const queryLatestMessagesOnce = (
  credentials: Credentials,
  conversationId: string,
): { promise: Promise<DbMessage[] | null>; cancel: () => void } => {
  const state: { settled: boolean; unsub: () => void } = {
    settled: false,
    unsub: () => {},
  };
  const promise = new Promise<DbMessage[] | null>((resolve) => {
    const finish = (msgs: DbMessage[] | null) => {
      if (state.settled) return;
      state.settled = true;
      clearTimeout(timer);
      state.unsub();
      resolve(msgs);
    };
    const timer = setTimeout(() => finish(null), fetchTimeoutMs);
    state.unsub = subscribeAuthedQuery(
      credentials,
      latestMessagesQuery(conversationId),
      ({ data, error }) => {
        if (error) return finish(null);
        if (data?.messages) finish(data.messages);
      },
    );
  });
  return {
    promise,
    cancel: () => {
      state.settled = true;
      state.unsub();
    },
  };
};

type RawKeyRow = {
  key?: EncryptedConversationKey;
  conversation?: MaybeArray<{ id?: string }>;
};

type SubscribeAllKeysQuery = (
  credentials: Credentials,
  query: ReturnType<typeof allKeysQuery>,
  cb: (result: { data?: { keys?: RawKeyRow[] } }) => void,
) => () => void;

type FetchLatestMessagesFn = (
  credentials: Credentials,
  conversationId: string,
) => { promise: Promise<DbMessage[] | null>; cancel: () => void };

export type ConversationPreviewsManager = {
  setConversations: (conversations: Conversation[]) => void;
  unsubscribe: () => void;
};

const isEncryptedMsgPayload = (
  value: unknown,
): value is DbMessage["payload"] => typeof value === "string";

type SwPushMessageData = {
  type: "alice:push-message";
  conversationId: string;
  conversationKey: string;
  message: { id: string; payload: DbMessage["payload"]; timestamp: number };
};

const isSwPushMessage = (data: unknown): data is SwPushMessageData =>
  isRecord(data) &&
  data.type === "alice:push-message" &&
  typeof data.conversationId === "string" &&
  typeof data.conversationKey === "string" &&
  isStoredPushMessage(data.message) &&
  isEncryptedMsgPayload(data.message.payload);

const listenSwMessages = (handler: (data: unknown) => void): () => void => {
  const sw = globalThis.navigator?.serviceWorker;
  if (!sw || typeof sw.addEventListener !== "function") return () => {};
  const listener = (event: MessageEvent) => handler(event.data);
  sw.addEventListener("message", listener);
  return () => sw.removeEventListener("message", listener);
};

const decryptMessagesList = (
  conversationId: string,
  conversationKey: string,
  rawMessages: DbMessage[],
): Promise<DecipheredMessage[]> => {
  const decryptOne = decryptMessage(conversationKey, { conversationId });
  return Promise.all(rawMessages.map(decryptOne)).then((results) =>
    results.filter((m): m is DecipheredMessage => m !== undefined)
  );
};

const samePreview = (
  a: ConversationPreview | undefined,
  b: ConversationPreview,
) =>
  a !== undefined &&
  a.text === b.text &&
  a.timestamp === b.timestamp &&
  a.authorPublicSignKey === b.authorPublicSignKey &&
  a.updatedAt === b.updatedAt &&
  Boolean(a.empty) === Boolean(b.empty);

export const makeCreateConversationPreviewsManager = ({
  subscribeKeys,
  fetchLatestMessages,
  keyStore = defaultPushKeyStore,
  readCache = readCachedConversationPreviews,
  writeCache = writeCachedConversationPreviews,
  maxConcurrency = maxConcurrentFetches,
  maxConversations = maxPriorityConversations,
}: {
  subscribeKeys: SubscribeAllKeysQuery;
  fetchLatestMessages: FetchLatestMessagesFn;
  keyStore?: Pick<PushKeyStore, "getConversationKey" | "setConversationKey">;
  readCache?: (publicSignKey: string) => ConversationPreviewMap;
  writeCache?: (
    publicSignKey: string,
    previews: ConversationPreviewMap,
  ) => void;
  maxConcurrency?: number;
  maxConversations?: number;
}) =>
(
  credentials: Credentials,
  onChange: (previews: ConversationPreviewMap) => void,
): ConversationPreviewsManager => {
  const { publicSignKey, privateEncryptKey } = credentials;
  const previews: ConversationPreviewMap = { ...readCache(publicSignKey) };
  const encryptedKeys = new Map<string, EncryptedConversationKey>();
  const plainKeys = new Map<string, string>();
  const keyDecryptInFlight = new Map<string, Promise<string | null>>();
  const pendingRawMessages = new Map<
    string,
    { messages: DbMessage[]; updatedAt: number }
  >();
  const checkedInSession = new Set<string>();
  const queued = new Map<string, number>();
  const inFlight = new Map<string, { updatedAt: number; cancel: () => void }>();
  const knownUpdatedAt = new Map<string, number>();
  const state = { cancelled: false };

  const emit = () => {
    if (state.cancelled) return;
    writeCache(publicSignKey, previews);
    onChange({ ...previews });
  };

  const applyPreview = (
    conversationId: string,
    preview: ConversationPreview,
  ) => {
    if (samePreview(previews[conversationId], preview)) return;
    previews[conversationId] = preview;
    emit();
  };

  const resolveKeyFor = (conversationId: string): Promise<string | null> => {
    const existingPlain = plainKeys.get(conversationId);
    if (existingPlain) return Promise.resolve(existingPlain);
    const encKey = encryptedKeys.get(conversationId);
    const cached = getCachedConversationKey(
      publicSignKey,
      conversationId,
      encKey,
    );
    if (cached) {
      plainKeys.set(conversationId, cached);
      return Promise.resolve(cached);
    }
    const inflight = keyDecryptInFlight.get(conversationId);
    if (inflight) return inflight;

    const promise = keyStore
      .getConversationKey(conversationId)
      .catch(() => null)
      .then((stored) => {
        if (stored) {
          plainKeys.set(conversationId, stored);
          registerConversationKeyCredentials(stored, credentials);
          return stored;
        }
        const latestEnc = encryptedKeys.get(conversationId);
        if (!latestEnc) return null;
        return decryptAsymmetric<string>(privateEncryptKey, latestEnc)
          .then((decrypted) => {
            plainKeys.set(conversationId, decrypted);
            cacheDecryptedConversationKey(
              publicSignKey,
              conversationId,
              latestEnc,
              decrypted,
            );
            registerConversationKeyCredentials(decrypted, credentials);
            keyStore.setConversationKey(conversationId, decrypted).catch(
              () => {},
            );
            return decrypted;
          })
          .catch(() => null);
      })
      .finally(() => {
        keyDecryptInFlight.delete(conversationId);
      });

    keyDecryptInFlight.set(conversationId, promise);
    return promise;
  };

  const decryptPendingFor = (conversationId: string) => {
    const pending = pendingRawMessages.get(conversationId);
    if (!pending) return;
    resolveKeyFor(conversationId).then((symKey) => {
      if (state.cancelled || !symKey) return;
      const current = pendingRawMessages.get(conversationId);
      if (!current || current.updatedAt !== pending.updatedAt) return;
      pendingRawMessages.delete(conversationId);
      decryptMessagesList(conversationId, symKey, current.messages).then(
        (decrypted) => {
          if (state.cancelled) return;
          const prev = previews[conversationId];
          if (prev && prev.updatedAt > current.updatedAt) return;
          applyPreview(
            conversationId,
            extractLatestPreview(decrypted, current.updatedAt),
          );
        },
      );
    });
  };

  const pumpQueue = () => {
    if (state.cancelled) return;
    const available = maxConcurrency - inFlight.size;
    if (available <= 0 || queued.size === 0) return;
    const batch = Array.from(queued.entries())
      .filter(([convId]) => !inFlight.has(convId))
      .sort(([, a], [, b]) => b - a)
      .slice(0, available);
    batch.forEach(([convId, targetUpdatedAt]) => {
      queued.delete(convId);
      const handle = fetchLatestMessages(credentials, convId);
      inFlight.set(convId, {
        updatedAt: targetUpdatedAt,
        cancel: handle.cancel,
      });
      handle.promise
        .then((rawMessages) => {
          if (state.cancelled || rawMessages === null) return;
          checkedInSession.add(convId);
          const effectiveUpdatedAt = Math.max(
            targetUpdatedAt,
            knownUpdatedAt.get(convId) ?? 0,
            rawMessages[0]?.timestamp ?? 0,
          );
          if (empty(rawMessages)) {
            applyPreview(convId, extractLatestPreview([], effectiveUpdatedAt));
            return;
          }
          pendingRawMessages.set(convId, {
            messages: rawMessages,
            updatedAt: effectiveUpdatedAt,
          });
          decryptPendingFor(convId);
        })
        .finally(() => {
          inFlight.delete(convId);
          pumpQueue();
        });
    });
  };

  const unsubKeys = subscribeKeys(
    credentials,
    allKeysQuery(publicSignKey),
    ({ data }) => {
      if (state.cancelled || !data?.keys) return;
      data.keys.forEach((row) => {
        const conv = firstOf(row.conversation);
        if (!conv?.id || !isEncryptedKeyStr(row.key)) return;
        const prevEnc = encryptedKeys.get(conv.id);
        if (prevEnc === row.key) return;
        encryptedKeys.set(conv.id, row.key);
        if (pendingRawMessages.has(conv.id)) {
          decryptPendingFor(conv.id);
        }
      });
    },
  );

  const onLiveMessages: LiveMessagesListener = (
    conversationId,
    messages,
    updatedAt,
  ) => {
    if (state.cancelled) return;
    checkedInSession.add(conversationId);
    const effectiveUpdatedAt = Math.max(
      updatedAt ?? 0,
      knownUpdatedAt.get(conversationId) ?? 0,
      messages[0]?.timestamp ?? 0,
      previews[conversationId]?.updatedAt ?? 0,
    );
    applyPreview(
      conversationId,
      extractLatestPreview(messages, effectiveUpdatedAt),
    );
  };
  liveMessagesListeners.add(onLiveMessages);

  const unsubSw = listenSwMessages((data) => {
    if (state.cancelled || !isSwPushMessage(data)) return;
    const { conversationId, conversationKey, message } = data;
    plainKeys.set(conversationId, conversationKey);
    const dbMsg: DbMessage = {
      id: message.id,
      payload: message.payload,
      timestamp: message.timestamp,
    };
    decryptMessagesList(conversationId, conversationKey, [dbMsg]).then(
      (decrypted) => {
        if (state.cancelled || empty(decrypted)) return;
        const nextPreview = extractLatestPreview(
          decrypted,
          Math.max(
            message.timestamp,
            knownUpdatedAt.get(conversationId) ?? 0,
          ),
        );
        if (nextPreview.empty) return;
        const existing = previews[conversationId];
        if (existing && existing.timestamp > nextPreview.timestamp) return;
        applyPreview(conversationId, nextPreview);
      },
    );
  });

  if (nonempty(Object.keys(previews))) {
    onChange({ ...previews });
  }

  return {
    setConversations: (conversations: Conversation[]) => {
      if (state.cancelled) return;
      const slice = conversations.slice(0, maxConversations);
      slice.forEach((conv) => {
        const updatedAt = conv.updatedAt ?? 0;
        knownUpdatedAt.set(conv.id, updatedAt);
        const existing = previews[conv.id];
        const upToDate = existing !== undefined &&
          (updatedAt > 0
            ? existing.updatedAt >= updatedAt
            : checkedInSession.has(conv.id));
        if (upToDate) return;
        const running = inFlight.get(conv.id);
        if (running && running.updatedAt >= updatedAt) return;
        const alreadyQueued = queued.get(conv.id);
        if (alreadyQueued !== undefined && alreadyQueued >= updatedAt) return;
        queued.set(conv.id, updatedAt);
      });
      pumpQueue();
    },
    unsubscribe: () => {
      state.cancelled = true;
      unsubKeys();
      unsubSw();
      liveMessagesListeners.delete(onLiveMessages);
      queued.clear();
      inFlight.forEach((entry) => entry.cancel());
      inFlight.clear();
      pendingRawMessages.clear();
    },
  };
};

export const createConversationPreviewsManager =
  makeCreateConversationPreviewsManager({
    subscribeKeys: (credentials, query, cb) =>
      subscribeAuthedQuery(credentials, query, cb),
    fetchLatestMessages: queryLatestMessagesOnce,
  });
