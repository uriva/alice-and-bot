import { useEffect, useRef, useState } from "react";
import type { Credentials } from "../protocol/src/clientApi.ts";
import {
  type Conversation,
  createTypingNotifier,
  type DecryptedMessagesResult,
  getOrCreateConversation,
  sendInitialMessage,
  subscribeConversationKey,
  subscribeConversations,
  subscribeDecryptedMessages,
  subscribeIdentityDetailsMap,
  subscribeIdentityProfile,
  subscribeTypingStates,
  subscribeUserName,
} from "./core/subscriptions.ts";
import { subscribeDarkMode } from "./core/dark-mode.ts";
import { subscribeIsMobile } from "./core/responsive.ts";
import { loadOrCreateCredentials } from "./core/credentials.ts";
import {
  type EphemeralStreamEvent,
  subscribeEphemeralStreams,
} from "./core/room.ts";

export type { DarkModeOverride } from "./core/dark-mode.ts";
export type { Conversation } from "./core/subscriptions.ts";
export type { EphemeralStreamEvent } from "./core/room.ts";
export { compactPublicKey } from "./core/subscriptions.ts";

type IdentityProfile = {
  name?: string;
  avatar?: string;
  alias?: string;
  priceTag?: number;
} | null;

type TypingPresenceResult = {
  readonly isTyping: boolean;
  readonly typingNames: string[];
  readonly onUserInput: () => void;
  readonly onBlurOrSend: () => void;
};

const useSubscription = <T>(
  subscribe: (cb: (v: T) => void) => () => void,
  deps: unknown[],
  initial: NoInfer<T>,
): T => {
  const [value, setValue] = useState(initial);
  useEffect(() => subscribe(setValue), deps);
  return value;
};

export const useDarkMode = (): boolean =>
  useSubscription(subscribeDarkMode, [], false);

export const useIsMobile = (): boolean =>
  useSubscription(subscribeIsMobile, [], false);

export const useConversations = (
  publicSignKey: string,
): Conversation[] | null =>
  useSubscription(
    (cb) => subscribeConversations(publicSignKey, cb),
    [publicSignKey],
    null as Conversation[] | null,
  );

export const useConversationKey = (
  conversationId: string,
  credentials: Credentials,
): string | null =>
  useSubscription(
    (cb) => subscribeConversationKey(conversationId, credentials, cb),
    [conversationId, credentials.publicSignKey],
    null as string | null,
  );

export const useDecryptedMessages = (
  _db: unknown,
  conversationKey: string | null,
  conversationId: string,
): DecryptedMessagesResult =>
  useSubscription(
    (cb) => subscribeDecryptedMessages(conversationId, conversationKey, cb),
    [conversationId, conversationKey],
    { messages: null, canLoadMore: false, loadMore: () => {} },
  );

export const useIdentityDetailsMap = (
  publicKeys: string[],
): Record<string, { name: string; avatar?: string }> =>
  useSubscription(
    (cb) => subscribeIdentityDetailsMap(publicKeys, cb),
    [publicKeys.join(",")],
    {} as Record<string, { name: string; avatar?: string }>,
  );

export const useIdentityProfile = (publicSignKey: string): IdentityProfile =>
  useSubscription(
    (cb) => subscribeIdentityProfile(publicSignKey, cb),
    [publicSignKey],
    null as IdentityProfile,
  );

export const useUserName = (publicSignKey: string): string | null =>
  useSubscription(
    (cb) => subscribeUserName(publicSignKey, cb),
    [publicSignKey],
    null as string | null,
  );

export const useCredentials = (
  name: string | null,
  key: string,
): Credentials | null => {
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  useEffect(() => {
    loadOrCreateCredentials(name, key).then(setCredentials);
  }, [name, key]);
  return credentials;
};

export const useEphemeralStreams = (
  _db: unknown,
  conversationId: string,
): EphemeralStreamEvent[] =>
  useSubscription(
    (cb) => subscribeEphemeralStreams(conversationId, cb),
    [conversationId],
    [],
  );

export const useGetOrCreateConversation = (
  { credentials, participants, initialMessage }: {
    credentials: Credentials;
    participants: string[];
    initialMessage?: string;
  },
): string | null => {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationKey, setConversationKey] = useState<string | null>(null);
  const [messageCount, setMessageCount] = useState<number | null>(null);
  const sentRef = useRef(false);
  const participantsKey = [...participants].sort().join(",");

  useEffect(
    () => getOrCreateConversation(credentials, participants, setConversationId),
    [credentials.publicSignKey, participantsKey],
  );

  useEffect(() => {
    if (!conversationId) return;
    return subscribeConversationKey(
      conversationId,
      credentials,
      setConversationKey,
    );
  }, [conversationId, credentials.publicSignKey]);

  useEffect(() => {
    if (!conversationId || !conversationKey) return;
    return subscribeDecryptedMessages(
      conversationId,
      conversationKey,
      ({ messages }) => setMessageCount(messages ? messages.length : null),
    );
  }, [conversationId, conversationKey]);

  useEffect(() => {
    if (
      !conversationId || !conversationKey || !initialMessage ||
      sentRef.current || messageCount === null || messageCount > 0
    ) return;
    sentRef.current = true;
    sendInitialMessage(
      conversationId,
      conversationKey,
      credentials,
      initialMessage,
      0,
    );
  }, [conversationId, conversationKey, messageCount, initialMessage]);

  return conversationId;
};

export const useTypingPresence = (
  _db: unknown,
  conversationId: string,
  selfPublicSignKey: string,
  lastMessageAuthorPublicKey: string | null,
): TypingPresenceResult => {
  const [isTyping, setIsTyping] = useState(false);
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const notifierRef = useRef(
    createTypingNotifier(conversationId, selfPublicSignKey),
  );

  useEffect(() => {
    notifierRef.current = createTypingNotifier(
      conversationId,
      selfPublicSignKey,
    );
    return () => notifierRef.current.stop();
  }, [conversationId, selfPublicSignKey]);

  const suppressRef = useRef<((key: string) => void) | null>(null);

  useEffect(() => {
    const { unsub, suppressAuthor } = subscribeTypingStates(
      conversationId,
      selfPublicSignKey,
      setTypingNames,
    );
    suppressRef.current = suppressAuthor;
    return unsub;
  }, [conversationId, selfPublicSignKey]);

  useEffect(() => {
    if (lastMessageAuthorPublicKey != null) {
      suppressRef.current?.(lastMessageAuthorPublicKey);
      if (isTyping) {
        notifierRef.current.onBlurOrSend();
        setIsTyping(false);
      }
    }
  }, [lastMessageAuthorPublicKey]);

  return {
    isTyping,
    typingNames,
    onUserInput: () => {
      setIsTyping(true);
      notifierRef.current.onInput();
    },
    onBlurOrSend: () => {
      setIsTyping(false);
      notifierRef.current.onBlurOrSend();
    },
  } as const;
};
