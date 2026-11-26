import type { InstaQLEntity } from "@instantdb/core";
import { empty, sort, unique } from "@uri/gamla";
import { getMessagesSigned, sendTyping } from "../../backend/src/api.ts";
import {
  createConversation,
  type Credentials,
  type DecipheredMessage,
  decryptMessage,
  type EncryptedConversationKey,
  getConversationKey,
  renameConversation,
  sendMessageWithKey,
} from "../../protocol/src/clientApi.ts";
import {
  canSignWithPrivateKey,
  decryptAsymmetric,
} from "../../protocol/src/crypto.ts";
import {
  lookupConversationKeyCredentials,
  registerConversationKeyCredentials,
  registerCredentials,
} from "../../protocol/src/instantAuth.ts";
import {
  defaultPushKeyStore,
  isStoredPushMessage,
  type PushKeyStore,
  type StoredPushMessage,
} from "../../protocol/src/pushKeyStore.ts";
import type schema from "../../instant.schema.ts";
import { reportError } from "./error-reporter.ts";
import {
  accessAdminDb,
  accessDb,
  ensureInstantAuth,
  hintColdBootstrap,
  isBrowserAuthCapable,
  subscribeAuthedInfiniteQuery,
  subscribeAuthedQuery,
  subscribeColdBootstrap,
} from "./instant-client.ts";

export const compactPublicKey = (k: string): string =>
  k.length <= 14 ? k : `${k.slice(0, 6)}…${k.slice(-4)}`;

export type Conversation = {
  id: string;
  title: string;
  participants: { publicSignKey: string; name?: string; avatar?: string }[];
  updatedAt?: number;
  archivedBy?: { publicSignKey: string }[];
};

const identityIdFields: ("id")[] = ["id"];
const participantDisplayFields: ("publicSignKey" | "name" | "avatar")[] = [
  "publicSignKey",
  "name",
  "avatar",
];
const archivedByFields: ("publicSignKey")[] = ["publicSignKey"];

export const conversationsQuery = (publicSignKey: string) => ({
  identities: {
    $: { where: { publicSignKey }, fields: identityIdFields },
    conversations: {
      participants: {
        $: { fields: participantDisplayFields },
      },
      archivedBy: {
        $: { where: { publicSignKey }, fields: archivedByFields },
      },
    },
  },
});

const sortConversationsDesc = (convs: Conversation[]): Conversation[] =>
  [...convs].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

export const subscribeConversations = (
  credentialsOrKey: Credentials | string,
  onChange: (conversations: Conversation[] | null) => void,
): () => void => {
  const publicSignKey = typeof credentialsOrKey === "string"
    ? credentialsOrKey
    : credentialsOrKey.publicSignKey;
  const state = { liveEmitted: false };
  hintColdBootstrap(publicSignKey, { includeConversations: true });
  const unsubBootstrap = subscribeColdBootstrap(
    publicSignKey,
    ({ conversations }) => {
      if (state.liveEmitted || !conversations) return;
      onChange(sortConversationsDesc(conversations));
    },
  );
  const unsubLive = subscribeAuthedQuery(
    credentialsOrKey,
    conversationsQuery(publicSignKey),
    ({ data, error }) => {
      if (error) console.error("Error fetching conversations:", error);
      if (!data?.identities) return onChange(null);
      state.liveEmitted = true;
      onChange(sortConversationsDesc(data.identities[0]?.conversations ?? []));
    },
  );
  return () => {
    unsubBootstrap();
    unsubLive();
  };
};

// subscribeConversationKey re-fires on every tick and can emit a transient null
// (a decrypt blip, or a momentarily-empty key row). Nulling an already-resolved
// conversation key wipes the visible message history downstream, so a null must
// never overwrite a good key; only a real key or the genuine first "no key"
// state takes effect.
export const nextConversationKey = (
  current: string | null,
  incoming: string | null,
): string | null => incoming ?? current;

export const decryptKeySafely = (
  decrypt: () => Promise<string>,
  onChange: (key: string | null) => void,
  report: (eventName: string) => void,
): Promise<void> =>
  decrypt()
    .then(onChange)
    .catch((error) => {
      console.error("Failed to decrypt conversation key", error);
      report("conversation_key_decrypt_failed");
    });

export const conversationKeyQuery = (
  conversationId: string,
  publicSignKey: string,
) => ({
  keys: {
    $: {
      where: {
        conversation: conversationId,
        "owner.publicSignKey": publicSignKey,
      },
    },
  },
});

const maxCachedConversationKeys = 512;
const decryptedConversationKeyCache = new Map<
  string,
  { encrypted: string; decrypted: string }
>();

const rememberDecryptedConversationKey = (
  cacheId: string,
  encrypted: string,
  decrypted: string,
) => {
  if (
    !decryptedConversationKeyCache.has(cacheId) &&
    decryptedConversationKeyCache.size >= maxCachedConversationKeys
  ) {
    const oldest = decryptedConversationKeyCache.keys().next().value;
    if (oldest !== undefined) decryptedConversationKeyCache.delete(oldest);
  }
  decryptedConversationKeyCache.set(cacheId, { encrypted, decrypted });
};

export const getCachedConversationKey = (
  publicSignKey: string,
  conversationId: string,
  encryptedKey?: string,
): string | null => {
  const hit = decryptedConversationKeyCache.get(
    `${publicSignKey}:${conversationId}`,
  );
  if (!hit) return null;
  if (encryptedKey !== undefined && hit.encrypted !== encryptedKey) return null;
  return hit.decrypted;
};

export const cacheDecryptedConversationKey = (
  publicSignKey: string,
  conversationId: string,
  encryptedKey: string,
  decryptedKey: string,
) =>
  rememberDecryptedConversationKey(
    `${publicSignKey}:${conversationId}`,
    encryptedKey,
    decryptedKey,
  );

const isEncryptedConversationKeyStr = (
  value: unknown,
): value is EncryptedConversationKey => typeof value === "string";

type SwPushMessageData = {
  type: "alice:push-message";
  conversationId: string;
  conversationKey: string;
  message: StoredPushMessage;
};

const isSwPushMessageData = (data: unknown): data is SwPushMessageData =>
  typeof data === "object" &&
  data !== null &&
  "type" in data &&
  data.type === "alice:push-message" &&
  "conversationId" in data &&
  typeof data.conversationId === "string" &&
  "conversationKey" in data &&
  typeof data.conversationKey === "string" &&
  "message" in data &&
  isStoredPushMessage(data.message);

const isSwSelectConversationFor = (
  data: unknown,
  conversationId: string,
): boolean =>
  typeof data === "object" &&
  data !== null &&
  "type" in data &&
  data.type === "alice:select-conversation" &&
  "conversationId" in data &&
  data.conversationId === conversationId;

const listenServiceWorkerMessages = (
  handler: (data: unknown) => void,
): () => void => {
  const sw = globalThis.navigator?.serviceWorker;
  if (!sw || typeof sw.addEventListener !== "function") return () => {};
  const listener = (event: MessageEvent) => handler(event.data);
  sw.addEventListener("message", listener);
  return () => sw.removeEventListener("message", listener);
};

type SubscribeConversationKeyQuery = (
  credentials: Credentials,
  query: ReturnType<typeof conversationKeyQuery>,
  cb: (resp: {
    data?: { keys?: Array<{ key?: EncryptedConversationKey }> };
    error?: unknown;
  }) => void,
) => () => void;

export const makeSubscribeConversationKey = ({
  subscribeQuery,
  keyStore = defaultPushKeyStore,
  fetchKey = getConversationKey,
  canFetchDirect = isBrowserAuthCapable,
  waitForAuth = ensureInstantAuth,
}: {
  subscribeQuery: SubscribeConversationKeyQuery;
  keyStore?: Pick<
    PushKeyStore,
    "getConversationKey" | "setConversationKey"
  >;
  fetchKey?: typeof getConversationKey;
  canFetchDirect?: () => boolean;
  waitForAuth?: typeof ensureInstantAuth;
}) =>
(
  conversationId: string,
  credentials: Credentials,
  onChange: (key: string | null) => void,
  onAccessChange?: (hasAccess: boolean) => void,
): () => void => {
  registerCredentials(credentials);
  const { publicSignKey, privateEncryptKey } = credentials;
  const cacheId = `${publicSignKey}:${conversationId}`;
  const state = { cancelled: false, resolved: false };
  const cachedEntry = decryptedConversationKeyCache.get(cacheId);
  if (cachedEntry) {
    state.resolved = true;
    registerConversationKeyCredentials(cachedEntry.decrypted, credentials);
    onAccessChange?.(true);
    onChange(cachedEntry.decrypted);
  }
  hintColdBootstrap(publicSignKey, { conversationId });

  const emitResolvedPlainKey = (plainKey: string) => {
    if (state.cancelled || state.resolved || !plainKey) return;
    state.resolved = true;
    registerConversationKeyCredentials(plainKey, credentials);
    onAccessChange?.(true);
    onChange(plainKey);
  };

  if (!cachedEntry) {
    keyStore
      .getConversationKey(conversationId)
      .then((storedKey) => {
        if (storedKey) emitResolvedPlainKey(storedKey);
      })
      .catch(() => {});
  }

  const unsubSw = listenServiceWorkerMessages((data) => {
    if (isSwPushMessageData(data) && data.conversationId === conversationId) {
      emitResolvedPlainKey(data.conversationKey);
    }
  });

  const decryptAndNotify = (encryptedKey: EncryptedConversationKey) => {
    const hit = decryptedConversationKeyCache.get(cacheId);
    if (hit && hit.encrypted === encryptedKey) {
      state.resolved = true;
      registerConversationKeyCredentials(hit.decrypted, credentials);
      onChange(hit.decrypted);
      return;
    }
    decryptKeySafely(
      () =>
        decryptAsymmetric<string>(privateEncryptKey, encryptedKey).then(
          (decryptedKey) => {
            rememberDecryptedConversationKey(
              cacheId,
              encryptedKey,
              decryptedKey,
            );
            keyStore
              .setConversationKey(conversationId, decryptedKey)
              .catch(() => {});
            registerConversationKeyCredentials(decryptedKey, credentials);
            return decryptedKey;
          },
        ),
      (decryptedKey) => {
        if (state.cancelled) return;
        if (decryptedKey) state.resolved = true;
        onChange(decryptedKey);
      },
      reportError,
    );
  };

  const unsubBootstrap = subscribeColdBootstrap(
    publicSignKey,
    ({ conversationBootstrap }) => {
      if (
        state.cancelled ||
        state.resolved ||
        conversationBootstrap?.conversationId !== conversationId
      ) {
        return;
      }
      onAccessChange?.(conversationBootstrap.hasAccess);
      if (
        !isEncryptedConversationKeyStr(conversationBootstrap.encryptedKey)
      ) {
        return onChange(null);
      }
      decryptAndNotify(conversationBootstrap.encryptedKey);
    },
  );

  if (!cachedEntry && canFetchDirect()) {
    waitForAuth(credentials)
      .then(() => {
        if (state.cancelled || state.resolved) return;
        return fetchKey(credentials, conversationId).then((decryptedKey) => {
          keyStore
            .setConversationKey(conversationId, decryptedKey)
            .catch(() => {});
          emitResolvedPlainKey(decryptedKey);
        });
      })
      .catch(() => {});
  }

  const unsubLive = subscribeQuery(
    credentials,
    conversationKeyQuery(conversationId, publicSignKey),
    ({ data, error }) => {
      if (error) console.error("Failed to fetch conversation key", error);
      if (!data?.keys) return;
      const encryptedKey = data.keys[0]?.key;
      onAccessChange?.(Boolean(encryptedKey));
      if (!encryptedKey) {
        decryptedConversationKeyCache.delete(cacheId);
        return onChange(null);
      }
      decryptAndNotify(encryptedKey);
    },
  );

  return () => {
    state.cancelled = true;
    unsubSw();
    unsubBootstrap();
    unsubLive();
  };
};

export const subscribeConversationKey = makeSubscribeConversationKey({
  subscribeQuery: (credentials, query, cb) =>
    subscribeAuthedQuery(credentials, query, cb),
});

export type DecryptedMessagesResult = {
  messages: DecipheredMessage[] | null;
  canLoadMore: boolean;
  loadMore: () => void;
};

type DbMessage = InstaQLEntity<typeof schema, "messages">;

type MessagesInfiniteQuery = {
  messages: {
    $: {
      where: { conversation: string };
      order: { timestamp: "desc" };
      limit: number;
    };
  };
};

type MessagesInfiniteResponse = {
  error?: { message: string };
  data?: { messages?: DbMessage[] };
  canLoadNextPage?: boolean;
};

type SubscribeMessagesInfinite = (
  query: MessagesInfiniteQuery,
  cb: (resp: MessagesInfiniteResponse) => void,
) => { unsubscribe: () => void; loadNextPage: () => void };

export type ConversationMessagesStream = {
  setConversationKey: (key: string | null) => Promise<void>;
  feedBootstrapMessages: (messages: DbMessage[], canLoadMore: boolean) => void;
  mergeMessages: (messages: DbMessage[]) => void;
  reconcileAfterSend?: () => void;
  unsubscribe: () => void;
};

const initialDecryptBatch = 20;
const wakeupCatchUpCooldownMs = 1500;
const postSendReconcileDelaysMs: readonly number[] = [1500, 5000, 12000];

const pruneCoveredSupplemental = (
  raw: DbMessage[] | undefined,
  canLoadMore: boolean,
  supplemental: Map<string, DbMessage>,
) => {
  if (supplemental.size === 0 || !raw || raw.length === 0) return;
  const rawIds = new Set(raw.map((m) => m.id));
  const oldestWindowTs = canLoadMore
    ? Math.min(...raw.map((m) => m.timestamp))
    : -Infinity;
  Array.from(supplemental.values()).forEach((m) => {
    if (rawIds.has(m.id) || m.timestamp < oldestWindowTs) {
      supplemental.delete(m.id);
    }
  });
};

const combineRawWithSupplemental = (
  raw: DbMessage[] | undefined,
  supplemental: Map<string, DbMessage>,
): DbMessage[] | undefined => {
  if (supplemental.size === 0) return raw;
  if (raw === undefined) return Array.from(supplemental.values());
  const rawIds = new Set(raw.map((m) => m.id));
  const extras = Array.from(supplemental.values()).filter(
    (m) => !rawIds.has(m.id),
  );
  return extras.length === 0 ? raw : [...extras, ...raw];
};

export const messagesInfiniteQuery = (
  conversationId: string,
): MessagesInfiniteQuery => ({
  messages: {
    $: {
      where: { conversation: conversationId },
      order: { timestamp: "desc" },
      limit: 100,
    },
  },
});

export const createConversationMessagesStream =
  (subscribeInfiniteQuery: SubscribeMessagesInfinite) =>
  (
    conversationId: string,
    onChange: (result: DecryptedMessagesResult) => void,
    initialKey: string | null = null,
  ): ConversationMessagesStream => {
    if (!conversationId) {
      onChange({ messages: null, canLoadMore: false, loadMore: () => {} });
      return {
        setConversationKey: () => Promise.resolve(),
        feedBootstrapMessages: () => {},
        mergeMessages: () => {},
        unsubscribe: () => {},
      };
    }
    const decryptedCache = new Map<string, DecipheredMessage | null>();
    const supplementalMessages = new Map<string, DbMessage>();
    const state: {
      conversationKey: string | null;
      rawMessages: DbMessage[] | undefined;
      liveReceived: boolean;
      hasEmittedInitial: boolean;
      canLoadMore: boolean;
      generation: number;
      active: boolean;
      loadNext: () => void;
    } = {
      conversationKey: initialKey,
      rawMessages: undefined,
      liveReceived: false,
      hasEmittedInitial: false,
      canLoadMore: false,
      generation: 0,
      active: true,
      loadNext: () => {},
    };

    const emit = (messages: DecipheredMessage[] | null) => {
      if (!state.active) return;
      onChange({
        messages,
        canLoadMore: state.canLoadMore,
        loadMore: () => state.loadNext(),
      });
    };

    const decryptSlice = (
      key: string,
      slice: DbMessage[],
    ): Promise<DecipheredMessage[]> => {
      const decryptOne = decryptMessage(key, { conversationId });
      return Promise.all(
        slice.map((msg) => {
          const cacheKey = `${key}:${msg.id}`;
          if (decryptedCache.has(cacheKey)) {
            return Promise.resolve(decryptedCache.get(cacheKey) ?? undefined);
          }
          return decryptOne(msg).then((res) => {
            decryptedCache.set(cacheKey, res ?? null);
            return res;
          });
        }),
      ).then((msgs) =>
        msgs.filter((m): m is DecipheredMessage => m !== undefined)
      );
    };

    const decryptAndEmit = (): Promise<void> => {
      const key = state.conversationKey;
      const encrypted = combineRawWithSupplemental(
        state.rawMessages,
        supplementalMessages,
      );
      const gen = ++state.generation;
      if (!key || !encrypted) {
        emit(null);
        return Promise.resolve();
      }
      return Promise.resolve()
        .then(async () => {
          const sorted = [...encrypted].sort((a, b) =>
            b.timestamp - a.timestamp
          );
          if (
            !state.hasEmittedInitial &&
            sorted.length > initialDecryptBatch
          ) {
            state.hasEmittedInitial = true;
            const head = await decryptSlice(
              key,
              sorted.slice(0, initialDecryptBatch),
            );
            if (gen !== state.generation || !state.active) return;
            emit(head);
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
            if (gen !== state.generation || !state.active) return;
            const tail = await decryptSlice(
              key,
              sorted.slice(initialDecryptBatch),
            );
            if (gen !== state.generation || !state.active) return;
            emit([...head, ...tail]);
            return;
          }
          if (state.rawMessages !== undefined) {
            state.hasEmittedInitial = true;
          }
          const all = await decryptSlice(key, sorted);
          if (gen !== state.generation || !state.active) return;
          emit(all);
        })
        .catch((err) => {
          console.error("Failed to decrypt messages", err);
          if (gen === state.generation) emit(null);
        });
    };

    const { unsubscribe, loadNextPage } = subscribeInfiniteQuery(
      messagesInfiniteQuery(conversationId),
      (resp) => {
        if (resp.error) {
          console.error("error fetching alice and bot messages", resp.error);
        }
        state.liveReceived = true;
        state.canLoadMore = resp.canLoadNextPage ?? false;
        state.rawMessages = resp.data?.messages;
        pruneCoveredSupplemental(
          state.rawMessages,
          state.canLoadMore,
          supplementalMessages,
        );
        decryptAndEmit();
      },
    );
    state.loadNext = loadNextPage;

    return {
      setConversationKey: (nextKey: string | null) => {
        if (nextKey === state.conversationKey) return Promise.resolve();
        state.conversationKey = nextKey;
        return state.rawMessages !== undefined || supplementalMessages.size > 0
          ? decryptAndEmit()
          : Promise.resolve();
      },
      feedBootstrapMessages: (messages: DbMessage[], canLoadMore: boolean) => {
        if (state.liveReceived || state.rawMessages !== undefined) return;
        state.canLoadMore = canLoadMore;
        state.rawMessages = messages;
        pruneCoveredSupplemental(
          state.rawMessages,
          state.canLoadMore,
          supplementalMessages,
        );
        decryptAndEmit();
      },
      mergeMessages: (messages: DbMessage[]) => {
        if (!state.active || empty(messages)) return;
        const rawIds = new Set((state.rawMessages ?? []).map((m) => m.id));
        const oldestWindowTs =
          state.canLoadMore && state.rawMessages && state.rawMessages.length > 0
            ? Math.min(...state.rawMessages.map((m) => m.timestamp))
            : -Infinity;
        const fresh = messages.filter(
          (m) =>
            !rawIds.has(m.id) &&
            m.timestamp >= oldestWindowTs &&
            supplementalMessages.get(m.id)?.payload !== m.payload,
        );
        if (empty(fresh)) return;
        fresh.forEach((m) => supplementalMessages.set(m.id, m));
        decryptAndEmit();
      },
      unsubscribe: () => {
        state.active = false;
        state.generation++;
        supplementalMessages.clear();
        decryptedCache.clear();
        unsubscribe();
      },
    };
  };

export const makeSubscribeDecryptedMessages =
  (subscribeInfiniteQuery: SubscribeMessagesInfinite) =>
  (
    conversationId: string,
    conversationKey: string | null,
    onChange: (result: DecryptedMessagesResult) => void,
  ) =>
    createConversationMessagesStream(subscribeInfiniteQuery)(
      conversationId,
      onChange,
      conversationKey,
    ).unsubscribe;

const isEncryptedMsgPayload = (
  value: unknown,
): value is DbMessage["payload"] => typeof value === "string";

const toDbMessages = (
  rows: Array<{ id: string; payload: unknown; timestamp: number }>,
): DbMessage[] =>
  rows.flatMap((m) =>
    isEncryptedMsgPayload(m.payload)
      ? [{ id: m.id, payload: m.payload, timestamp: m.timestamp }]
      : []
  );

export const makeSubscribeConversationMessagesStream = ({
  subscribeInfiniteQuery,
  keyStore = defaultPushKeyStore,
  fetchMessages = getMessagesSigned,
  canFetchDirect = isBrowserAuthCapable,
  waitForAuth = ensureInstantAuth,
  reconcileDelaysMs = postSendReconcileDelaysMs,
}: {
  subscribeInfiniteQuery: (
    credentials: Credentials | undefined,
    query: MessagesInfiniteQuery,
    cb: (resp: MessagesInfiniteResponse) => void,
  ) => { unsubscribe: () => void; loadNextPage: () => void };
  keyStore?: Pick<PushKeyStore, "getConversationMessages">;
  fetchMessages?: typeof getMessagesSigned;
  canFetchDirect?: () => boolean;
  waitForAuth?: typeof ensureInstantAuth;
  reconcileDelaysMs?: readonly number[];
}) =>
(
  conversationId: string,
  credentials: Credentials | undefined,
  onChange: (result: DecryptedMessagesResult) => void,
  initialKey: string | null = null,
): ConversationMessagesStream => {
  const publicSignKey = credentials?.publicSignKey ?? "";
  if (publicSignKey && conversationId) {
    hintColdBootstrap(publicSignKey, { conversationId });
  }
  const postSendTimers = new Set<ReturnType<typeof setTimeout>>();
  const clearPostSendTimers = () => {
    postSendTimers.forEach((timer) => clearTimeout(timer));
    postSendTimers.clear();
  };
  const syncState = {
    cancelled: false,
    bootstrapReceived: false,
    catchUpInFlight: false,
    lastCatchUpAt: 0,
    awaitingPostSendLiveCount: 0,
  };
  const stream = createConversationMessagesStream((query, cb) =>
    subscribeInfiniteQuery(credentials, query, (resp) => {
      if (resp.data?.messages && syncState.awaitingPostSendLiveCount > 0) {
        syncState.awaitingPostSendLiveCount = Math.max(
          0,
          syncState.awaitingPostSendLiveCount - 1,
        );
        if (syncState.awaitingPostSendLiveCount === 0) clearPostSendTimers();
      }
      cb(resp);
    })
  )(conversationId, onChange, initialKey);

  const pullStoredPushMessages = () => {
    if (!conversationId) return;
    keyStore
      .getConversationMessages(conversationId)
      .then((stored) => {
        if (syncState.cancelled || empty(stored)) return;
        stream.mergeMessages(toDbMessages(stored));
      })
      .catch(() => {});
  };

  const catchUpFromBackend = (force = false) => {
    if (
      syncState.cancelled ||
      syncState.catchUpInFlight ||
      !credentials ||
      !conversationId ||
      !canFetchDirect()
    ) {
      return;
    }
    const now = Date.now();
    if (!force && now - syncState.lastCatchUpAt < wakeupCatchUpCooldownMs) {
      return;
    }
    syncState.catchUpInFlight = true;
    syncState.lastCatchUpAt = now;
    canSignWithPrivateKey(credentials.privateSignKey)
      .then((canSign) => {
        if (!canSign || syncState.cancelled) return;
        return fetchMessages({ conversationId, limit: 100, credentials })
          .then((res) => {
            if (syncState.cancelled || "error" in res) return;
            const dbMsgs = toDbMessages(res.messages);
            stream.feedBootstrapMessages(dbMsgs, res.hasMore);
            stream.mergeMessages(dbMsgs);
          });
      })
      .catch(() => {})
      .finally(() => {
        syncState.catchUpInFlight = false;
      });
  };

  pullStoredPushMessages();

  const unsubSw = conversationId
    ? listenServiceWorkerMessages((data) => {
      if (
        isSwPushMessageData(data) &&
        data.conversationId === conversationId
      ) {
        stream.setConversationKey(data.conversationKey);
        stream.mergeMessages(toDbMessages([data.message]));
        return;
      }
      if (isSwSelectConversationFor(data, conversationId)) {
        pullStoredPushMessages();
        catchUpFromBackend(true);
      }
    })
    : () => {};

  const onVisibilityOrFocus = () => {
    if (globalThis.document?.visibilityState === "hidden") return;
    pullStoredPushMessages();
    catchUpFromBackend();
  };

  if (conversationId && typeof globalThis.addEventListener === "function") {
    globalThis.addEventListener("focus", onVisibilityOrFocus);
  }
  if (
    conversationId &&
    typeof globalThis.document?.addEventListener === "function"
  ) {
    globalThis.document.addEventListener(
      "visibilitychange",
      onVisibilityOrFocus,
    );
  }

  const unsubBootstrap = publicSignKey && conversationId
    ? subscribeColdBootstrap(publicSignKey, ({ conversationBootstrap }) => {
      if (
        conversationBootstrap?.conversationId !== conversationId ||
        !conversationBootstrap.hasAccess
      ) {
        return;
      }
      syncState.bootstrapReceived = true;
      const dbMsgs = toDbMessages(conversationBootstrap.messages);
      stream.feedBootstrapMessages(dbMsgs, conversationBootstrap.hasMore);
      stream.mergeMessages(dbMsgs);
    })
    : () => {};

  if (credentials && conversationId && canFetchDirect()) {
    waitForAuth(credentials)
      .then(() => {
        if (!syncState.bootstrapReceived) {
          catchUpFromBackend(true);
        }
      })
      .catch(() => {});
  }

  const reconcileAfterSend = () => {
    if (syncState.cancelled || !credentials || !conversationId) return;
    clearPostSendTimers();
    // Expect two live snapshots after a user send (the sent message + reply).
    // If the live WebSocket is stalled, fallback HTTP catch-ups display both
    // without requiring a page reload; healthy live snapshots cancel timers.
    syncState.awaitingPostSendLiveCount = 2;
    reconcileDelaysMs.forEach((delayMs) => {
      const timer = setTimeout(() => {
        postSendTimers.delete(timer);
        catchUpFromBackend(true);
      }, delayMs);
      postSendTimers.add(timer);
    });
  };

  return {
    setConversationKey: stream.setConversationKey,
    feedBootstrapMessages: stream.feedBootstrapMessages,
    mergeMessages: stream.mergeMessages,
    reconcileAfterSend,
    unsubscribe: () => {
      syncState.cancelled = true;
      clearPostSendTimers();
      if (typeof globalThis.removeEventListener === "function") {
        globalThis.removeEventListener("focus", onVisibilityOrFocus);
      }
      if (typeof globalThis.document?.removeEventListener === "function") {
        globalThis.document.removeEventListener(
          "visibilitychange",
          onVisibilityOrFocus,
        );
      }
      unsubSw();
      unsubBootstrap();
      stream.unsubscribe();
    },
  };
};

export const subscribeConversationMessagesStream =
  makeSubscribeConversationMessagesStream({
    subscribeInfiniteQuery: (credentials, query, cb) =>
      subscribeAuthedInfiniteQuery(credentials, query, cb),
  });

export const subscribeDecryptedMessages: ReturnType<
  typeof makeSubscribeDecryptedMessages
> = (conversationId, conversationKey, onChange) =>
  makeSubscribeDecryptedMessages((query, cb) =>
    subscribeAuthedInfiniteQuery(
      conversationKey
        ? lookupConversationKeyCredentials(conversationKey)
        : undefined,
      query,
      cb,
    )
  )(conversationId, conversationKey, onChange);

export const subscribeIdentityDetailsMap = (
  publicKeys: string[],
  onChange: (
    details: Record<string, { name: string; avatar?: string }>,
  ) => void,
): () => void => {
  const keys = Array.from(new Set(publicKeys)).filter(Boolean);
  if (empty(keys)) {
    onChange({});
    return () => {};
  }
  return accessDb().subscribeQuery(
    { identities: { $: { where: { publicSignKey: { $in: keys } } } } },
    ({ data }) => {
      const entries = Object.fromEntries(
        (data?.identities ?? []).map((identity) => [
          identity.publicSignKey,
          {
            name: identity.name || compactPublicKey(identity.publicSignKey),
            avatar: identity.avatar,
          },
        ]),
      );
      onChange(entries);
    },
  );
};

export const subscribeIdentityProfile = (
  publicSignKey: string,
  onChange: (
    profile: {
      id: string;
      name?: string;
      avatar?: string;
      alias?: string;
      priceTag?: number;
    } | null,
  ) => void,
): () => void =>
  accessDb().subscribeQuery(
    { identities: { $: { where: { publicSignKey } } } },
    ({ data, error }) => {
      if (error) console.error("Error fetching identity profile", error);
      const identity = data?.identities?.[0];
      if (!identity) return onChange(null);
      const { id, name, avatar, alias, priceTag } = identity;
      onChange({ id, name, avatar, alias, priceTag });
    },
  );

export const subscribeUserName = (
  publicSignKey: string,
  onChange: (name: string | null) => void,
): () => void =>
  accessDb().subscribeQuery(
    { identities: { $: { where: { publicSignKey } } } },
    ({ data }) => {
      if (!data) return onChange(null);
      onChange(data.identities[0]?.name?.split("@")[0] ?? null);
    },
  );

export const typingTtl = 20000;

type TypingState = {
  owner?: { publicSignKey?: string; name?: string };
  updatedAt?: number;
};

const isNotSuppressed =
  (suppressed: Map<string, number>) => (t: TypingState) => {
    const key = t.owner?.publicSignKey;
    if (!key) return true;
    const ts = suppressed.get(key);
    return ts === undefined || (t.updatedAt ?? 0) > ts;
  };

const typingNamesFromStates = (
  states: TypingState[],
  selfPublicSignKey: string,
  suppressed: Map<string, number>,
) => {
  const now = Date.now();
  return states
    .filter((t) => t.owner?.publicSignKey !== selfPublicSignKey)
    .filter(isNotSuppressed(suppressed))
    .filter((t) => t.updatedAt && now - t.updatedAt < typingTtl)
    .map((t) =>
      t.owner?.name ||
      (t.owner?.publicSignKey
        ? compactPublicKey(t.owner.publicSignKey)
        : undefined)
    )
    .filter((x): x is string => Boolean(x));
};

type SubscribeQuery = (
  query: Record<string, unknown>,
  cb: (result: { data?: { typingStates?: TypingState[] } }) => void,
) => () => void;

export const makeSubscribeTypingStates = (subscribeQuery: SubscribeQuery) =>
(
  conversationId: string,
  selfPublicSignKey: string,
  onChange: (typingNames: string[]) => void,
) => {
  let latestStates: TypingState[] = [];
  const suppressed = new Map<string, number>();
  const emit = () =>
    onChange(
      typingNamesFromStates(latestStates, selfPublicSignKey, suppressed),
    );
  const interval = setInterval(emit, 5000);
  const unsubQuery = subscribeQuery(
    {
      typingStates: {
        owner: {},
        $: { where: { conversation: conversationId } },
      },
    },
    ({ data }) => {
      latestStates = data?.typingStates ?? [];
      emit();
    },
  );
  return {
    unsub: () => {
      clearInterval(interval);
      unsubQuery();
    },
    suppressAuthor: (publicSignKey: string) => {
      suppressed.set(publicSignKey, Date.now());
      emit();
    },
  };
};

export const subscribeTypingStates = (
  conversationId: string,
  selfPublicSignKey: string,
  onChange: (typingNames: string[]) => void,
) => {
  const state: { latestStates: TypingState[] } = { latestStates: [] };
  const suppressed = new Map<string, number>();
  const emit = () =>
    onChange(
      typingNamesFromStates(state.latestStates, selfPublicSignKey, suppressed),
    );
  const interval = setInterval(emit, 5000);
  const unsubQuery = subscribeAuthedQuery(
    selfPublicSignKey,
    {
      typingStates: {
        owner: {},
        $: { where: { conversation: conversationId } },
      },
    },
    ({ data }) => {
      state.latestStates = data?.typingStates ?? [];
      emit();
    },
  );
  return {
    unsub: () => {
      clearInterval(interval);
      unsubQuery();
    },
    suppressAuthor: (publicSignKey: string) => {
      suppressed.set(publicSignKey, Date.now());
      emit();
    },
  };
};

type SendTypingFn = (
  params: { conversation: string; isTyping: boolean; publicSignKey: string },
) => Promise<unknown>;

export const makeCreateTypingNotifier = (sendTypingFn: SendTypingFn) =>
(
  conversationId: string,
  selfPublicSignKey: string,
) => {
  let timer: number | null = null;
  let typing = false;
  let sentStop = false;

  const notify = (isTyping: boolean) => {
    typing = isTyping;
    sendTypingFn({
      conversation: conversationId,
      isTyping,
      publicSignKey: selfPublicSignKey,
    }).catch(() => {});
  };

  return {
    onInput: () => {
      if (sentStop) {
        sentStop = false;
        return;
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        typing = false;
        sentStop = true;
        notify(false);
      }, typingTtl) as unknown as number;
      if (!typing) notify(true);
      typing = true;
    },
    onBlurOrSend: () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (typing) notify(false);
      sentStop = true;
    },
    stop: () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (typing) notify(false);
      sentStop = true;
    },
  };
};

export const createTypingNotifier = makeCreateTypingNotifier(sendTyping);

const matchesParticipants =
  (participants: string[]) =>
  (conversation: { participants: { publicSignKey: string }[] }) =>
    conversation.participants.length === participants.length &&
    conversation.participants.every(({ publicSignKey }) =>
      participants.includes(publicSignKey)
    );

// A user can hold more than one conversation with the exact same participant set
// (e.g. an admin/system task spawns a second {user, bot} conversation). Picking
// the first/most-recently-touched match can land on an empty duplicate and hide
// the real history. Rank by real message activity first (a conversation that has
// messages beats an empty one; newer last message wins), then fall back to
// updatedAt so behaviour is unchanged when activity is unknown/equal.
export type ConversationActivity = {
  hasMessages: boolean;
  lastMessageAt: number;
};

export const pickBestConversation = <
  T extends { id: string; updatedAt?: number },
>(
  candidates: T[],
  activityOf: (id: string) => ConversationActivity | undefined,
): T | undefined => {
  if (candidates.length <= 1) return candidates[0];
  const score = (c: T) => {
    const a = activityOf(c.id);
    return [
      a?.hasMessages ? 1 : 0,
      a?.lastMessageAt ?? 0,
      c.updatedAt ?? 0,
    ] as const;
  };
  return [...candidates].sort((a, b) => {
    const [ah, al, au] = score(a);
    const [bh, bl, bu] = score(b);
    return bh - ah || bl - al || bu - au;
  })[0];
};

export const createConversationSafely = <T extends object>(
  create: () => Promise<T | { error: unknown }>,
  onSettled: (result: T | null) => void,
): void => {
  create()
    .then((result) => onSettled("error" in result ? null : result))
    .catch((error) => {
      console.error("Error creating conversation:", error);
      onSettled(null);
    });
};

// InstantDB does not support filtering a link by an `$in` array of ids
// (`where: { conversation: { $in: [...] } }` returns nothing), so activity is
// gathered per-conversation with the same single-id message query the chat
// itself uses. Duplicate participant sets are rare, so a handful of tiny
// subscriptions is fine.
const activityMessageQuery = (conversationId: string) => ({
  messages: {
    $: {
      where: { conversation: conversationId },
      order: { timestamp: "desc" as const },
      limit: 1,
    },
  },
});

const subscribeConversationsActivity = (
  conversationIds: string[],
  onChange: (activity: Record<string, ConversationActivity>) => void,
  credentials?: Credentials,
): () => void => {
  const activity: Record<string, ConversationActivity> = Object.fromEntries(
    conversationIds.map((id) => [id, { hasMessages: false, lastMessageAt: 0 }]),
  );
  const unsubs = conversationIds.map((id) =>
    subscribeAuthedQuery(credentials, activityMessageQuery(id), ({ data }) => {
      const latest = data?.messages?.[0];
      activity[id] = latest
        ? { hasMessages: true, lastMessageAt: latest.timestamp }
        : { hasMessages: false, lastMessageAt: 0 };
      onChange({ ...activity });
    })
  );
  return () => unsubs.forEach((u) => u());
};

export const getOrCreateConversation = (
  credentials: Credentials,
  participants: string[],
  onConversation: (id: string) => void,
  title = "Chat",
): () => void => {
  const fixedParticipants = sort(
    unique([credentials.publicSignKey, ...participants]),
  );
  let inFlight = false;
  let activityUnsub: (() => void) | null = null;
  const teardown = () => {
    activityUnsub?.();
    activityUnsub = null;
  };
  const createIfNeeded = () => {
    if (inFlight) return;
    inFlight = true;
    createConversationSafely(
      () =>
        createConversation(accessAdminDb)(
          fixedParticipants,
          title,
          credentials,
        ),
      (result) => {
        if (!result) inFlight = false;
        else if (
          "conversationId" in result &&
          typeof result.conversationId === "string"
        ) {
          onConversation(result.conversationId);
        }
      },
    );
  };
  registerCredentials(credentials);
  const unsub = subscribeConversations(
    credentials,
    (conversations) => {
      if (!conversations) return;
      const matches = conversations.filter(
        matchesParticipants(fixedParticipants),
      );
      teardown();
      if (matches.length === 0) return createIfNeeded();
      if (title && title !== "Chat") {
        matches.forEach((conv) => {
          if (conv.title !== title) {
            renameConversation({
              conversationId: conv.id,
              title,
              credentials,
            }).catch(() => {});
          }
        });
      }
      if (matches.length === 1) return onConversation(matches[0].id);
      activityUnsub = subscribeConversationsActivity(
        matches.map((c) => c.id),
        (activity) => {
          const best = pickBestConversation(matches, (id) => activity[id]);
          if (best) onConversation(best.id);
        },
        credentials,
      );
    },
  );
  return () => {
    teardown();
    unsub();
  };
};

export const sendInitialMessage = (
  conversationId: string,
  conversationKey: string,
  credentials: Credentials,
  initialMessage: string,
  messageCount: number,
) => {
  if (
    !conversationId || messageCount > 0 || !conversationKey || !initialMessage
  ) {
    return;
  }
  sendMessageWithKey({
    conversation: conversationId,
    conversationKey,
    credentials,
    message: { type: "text", text: initialMessage },
  }).catch((e) => console.error("failed sending initial message", e));
};
