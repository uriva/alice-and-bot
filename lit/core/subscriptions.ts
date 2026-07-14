import type { InstaQLEntity } from "@instantdb/core";
import { sort, unique } from "@uri/gamla";
import { sendTyping } from "../../backend/src/api.ts";
import {
  createConversation,
  type Credentials,
  type DecipheredMessage,
  decryptMessage,
  sendMessageWithKey,
} from "../../protocol/src/clientApi.ts";
import { decryptAsymmetric } from "../../protocol/src/crypto.ts";
import type schema from "../../instant.schema.ts";
import { reportError } from "./error-reporter.ts";
import { accessAdminDb, accessDb } from "./instant-client.ts";

export const compactPublicKey = (k: string): string =>
  k.length <= 14 ? k : `${k.slice(0, 6)}…${k.slice(-4)}`;

export type Conversation = {
  id: string;
  title: string;
  participants: { publicSignKey: string }[];
  updatedAt?: number;
  archivedBy?: { publicSignKey: string }[];
};

export const subscribeConversations = (
  publicSignKey: string,
  onChange: (conversations: Conversation[] | null) => void,
): () => void =>
  accessDb().subscribeQuery(
    {
      conversations: {
        participants: {},
        archivedBy: {
          $: { where: { publicSignKey } },
        },
        $: { where: { "participants.publicSignKey": publicSignKey } },
      },
    },
    ({ data, error }) => {
      if (error) console.error("Error fetching conversations:", error);
      if (!data?.conversations) return onChange(null);
      onChange(
        [...data.conversations].sort(
          (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0),
        ),
      );
    },
  );

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

export const subscribeConversationKey = (
  conversationId: string,
  { publicSignKey, privateEncryptKey }: Credentials,
  onChange: (key: string | null) => void,
): () => void =>
  accessDb().subscribeQuery(
    {
      identities: {
        $: { where: { publicSignKey } },
        keys: {
          $: { where: { conversation: conversationId } },
        },
      },
    },
    ({ data, error }) => {
      if (error) console.error("Failed to fetch conversation key", error);
      const encryptedKey = data?.identities?.[0]?.keys?.[0]?.key;
      if (!encryptedKey) return onChange(null);
      decryptKeySafely(
        () => decryptAsymmetric<string>(privateEncryptKey, encryptedKey),
        onChange,
        reportError,
      );
    },
  );

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

export const makeSubscribeDecryptedMessages =
  (subscribeInfiniteQuery: SubscribeMessagesInfinite) =>
  (
    conversationId: string,
    conversationKey: string | null,
    onChange: (result: DecryptedMessagesResult) => void,
  ) => {
    const { unsubscribe, loadNextPage } = subscribeInfiniteQuery(
      messagesInfiniteQuery(conversationId),
      (resp) => {
        if (resp.error) {
          console.error("error fetching alice and bot messages", resp.error);
        }
        const emit = (messages: DecipheredMessage[] | null) =>
          onChange({
            messages,
            canLoadMore: resp.canLoadNextPage ?? false,
            loadMore: () => loadNextPage(),
          });
        const encrypted = resp.data?.messages;
        if (!conversationKey || !encrypted) return emit(null);
        const sorted = [...encrypted].sort((a, b) => b.timestamp - a.timestamp);
        Promise.all(sorted.map(decryptMessage(conversationKey))).then((msgs) =>
          emit(msgs.filter((m) => m !== undefined))
        );
      },
    );
    return unsubscribe;
  };

export const subscribeDecryptedMessages: ReturnType<
  typeof makeSubscribeDecryptedMessages
> = makeSubscribeDecryptedMessages(
  (query, cb) => accessDb().subscribeInfiniteQuery(query, cb),
);

export const subscribeIdentityDetailsMap = (
  publicKeys: string[],
  onChange: (
    details: Record<string, { name: string; avatar?: string }>,
  ) => void,
): () => void => {
  const keys = Array.from(new Set(publicKeys));
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
  const db = accessDb();
  let latestStates: TypingState[] = [];
  const suppressed = new Map<string, number>();
  const emit = () =>
    onChange(
      typingNamesFromStates(latestStates, selfPublicSignKey, suppressed),
    );
  const interval = setInterval(emit, 5000);
  const unsubQuery = db.subscribeQuery(
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
  onSettled: (created: boolean) => void,
): void => {
  create()
    .then((result) => onSettled(!("error" in result)))
    .catch((error) => {
      console.error("Error creating conversation:", error);
      onSettled(false);
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
): () => void => {
  const activity: Record<string, ConversationActivity> = {};
  for (const id of conversationIds) {
    activity[id] = { hasMessages: false, lastMessageAt: 0 };
  }
  const unsubs = conversationIds.map((id) =>
    accessDb().subscribeQuery(activityMessageQuery(id), ({ data }) => {
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
          "Chat",
          credentials,
        ),
      (created) => {
        if (!created) inFlight = false;
      },
    );
  };
  const unsub = subscribeConversations(
    credentials.publicSignKey,
    (conversations) => {
      if (!conversations) return;
      const matches = conversations.filter(
        matchesParticipants(fixedParticipants),
      );
      teardown();
      if (matches.length === 0) return createIfNeeded();
      if (matches.length === 1) return onConversation(matches[0].id);
      activityUnsub = subscribeConversationsActivity(
        matches.map((c) => c.id),
        (activity) => {
          const best = pickBestConversation(matches, (id) => activity[id]);
          if (best) onConversation(best.id);
        },
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
