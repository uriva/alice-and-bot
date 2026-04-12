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
import { accessAdminDb, accessDb } from "./instant-client.ts";

export const compactPublicKey = (k: string): string =>
  k.length <= 14 ? k : `${k.slice(0, 6)}…${k.slice(-4)}`;

export type Conversation = {
  id: string;
  title: string;
  participants: { publicSignKey: string }[];
  updatedAt?: number;
};

export const subscribeConversations = (
  publicSignKey: string,
  onChange: (conversations: Conversation[] | null) => void,
): () => void =>
  accessDb().subscribeQuery(
    {
      conversations: {
        participants: {},
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

export const subscribeConversationKey = (
  conversationId: string,
  { publicSignKey, privateEncryptKey }: Credentials,
  onChange: (key: string | null) => void,
): () => void =>
  accessDb().subscribeQuery(
    {
      keys: {
        $: {
          where: {
            "owner.publicSignKey": publicSignKey,
            conversation: conversationId,
          },
        },
      },
    },
    ({ data, error }) => {
      if (error) console.error("Failed to fetch conversation key", error);
      const encryptedKey = data?.keys[0]?.key;
      if (!encryptedKey) return onChange(null);
      decryptAsymmetric<string>(privateEncryptKey, encryptedKey).then(onChange);
    },
  );

export type DecryptedMessagesResult = {
  messages: DecipheredMessage[] | null;
  canLoadMore: boolean;
  loadMore: () => void;
};

export const subscribeDecryptedMessages = (
  conversationId: string,
  conversationKey: string | null,
  onChange: (result: DecryptedMessagesResult) => void,
) => {
  const { unsubscribe, loadNextPage } = accessDb().subscribeInfiniteQuery(
    {
      messages: {
        conversation: {},
        $: {
          where: { conversation: conversationId },
          order: { timestamp: "desc" },
          limit: 100,
        },
      },
    },
    (resp) => {
      if (resp.error) {
        console.error("error fetching alice and bot messages", resp.error);
      }
      const encrypted = resp.data?.messages;
      if (!conversationKey || !encrypted) {
        return onChange({
          messages: null,
          canLoadMore: resp.canLoadNextPage ?? false,
          loadMore: loadNextPage,
        });
      }
      const sorted = [...encrypted].sort((a, b) => b.timestamp - a.timestamp);
      Promise.all(sorted.map(decryptMessage(conversationKey))).then(
        (msgs) =>
          onChange({
            messages: msgs.filter((m) => m !== undefined),
            canLoadMore: resp.canLoadNextPage ?? false,
            loadMore: loadNextPage,
          }),
      );
    },
  );
  return unsubscribe;
};

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
      const { name, avatar, alias, priceTag } = identity;
      onChange({ name, avatar, alias, priceTag });
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

const typingNamesFromStates = (
  states: TypingState[],
  selfPublicSignKey: string,
) => {
  const now = Date.now();
  return states
    .filter((t) => t.owner?.publicSignKey !== selfPublicSignKey)
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
  const emit = () =>
    onChange(typingNamesFromStates(latestStates, selfPublicSignKey));
  const interval = setInterval(emit, 5000);
  const unsub = subscribeQuery(
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
  return () => {
    clearInterval(interval);
    unsub();
  };
};

export const subscribeTypingStates = (
  conversationId: string,
  selfPublicSignKey: string,
  onChange: (typingNames: string[]) => void,
) => {
  const db = accessDb();
  let latestStates: TypingState[] = [];
  const emit = () =>
    onChange(typingNamesFromStates(latestStates, selfPublicSignKey));
  const interval = setInterval(emit, 5000);
  const unsub = db.subscribeQuery(
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
  return () => {
    clearInterval(interval);
    unsub();
  };
};

export const createTypingNotifier = (
  conversationId: string,
  selfPublicSignKey: string,
) => {
  let timer: number | null = null;
  let typing = false;

  const notify = (isTyping: boolean) => {
    typing = isTyping;
    sendTyping({
      conversation: conversationId,
      isTyping,
      publicSignKey: selfPublicSignKey,
    }).catch(() => {});
  };

  return {
    onInput: () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        typing = false;
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
    },
    stop: () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (typing) notify(false);
    },
  };
};

const matchesParticipants =
  (participants: string[]) =>
  (conversation: { participants: { publicSignKey: string }[] }) =>
    conversation.participants.length === participants.length &&
    conversation.participants.every(({ publicSignKey }) =>
      participants.includes(publicSignKey)
    );

export const getOrCreateConversation = (
  credentials: Credentials,
  participants: string[],
  onConversation: (id: string) => void,
): () => void => {
  const fixedParticipants = sort(
    unique([credentials.publicSignKey, ...participants]),
  );
  let inFlight = false;
  return subscribeConversations(
    credentials.publicSignKey,
    (conversations) => {
      if (!conversations) return;
      const existing = conversations.find(
        matchesParticipants(fixedParticipants),
      );
      if (existing) return onConversation(existing.id);
      if (inFlight) return;
      inFlight = true;
      createConversation(accessAdminDb)(
        fixedParticipants,
        "Chat",
        credentials,
      ).then((result) => {
        if ("error" in result) {
          console.error("Error creating conversation:", result.error);
          inFlight = false;
        }
      });
    },
  );
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
