import type { InstantReactWebDatabase } from "@instantdb/react";
import { map, pipe, sort, unique } from "gamla";
import { useEffect, useState } from "preact/hooks";
import type schema from "../../../instant.schema.ts";
import {
  createConversation,
  createIdentity,
  type Credentials,
  type DecipheredMessage,
  decryptMessage,
  sendMessageWithKey,
} from "../../../protocol/src/api.ts";
import { decryptAsymmetric } from "../../../protocol/src/crypto.ts";

export const useDarkMode = () => {
  const getPref = () =>
    typeof globalThis !== "undefined" &&
    "matchMedia" in globalThis &&
    globalThis.matchMedia("(prefers-color-scheme: dark)").matches;

  const [isDark, setIsDark] = useState(getPref());

  useEffect(() => {
    const mql = globalThis.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return isDark;
};

export type Conversation = {
  id: string;
  title: string;
  participants: { publicSignKey: string }[];
};

export const useConversations =
  (db: () => InstantReactWebDatabase<typeof schema>) =>
  (publicSignKey: string): Conversation[] | null => {
    const { data, error } = db().useQuery({
      conversations: {
        participants: {},
        $: { where: { "participants.publicSignKey": publicSignKey } },
      },
    });
    if (error) console.error("Error fetching conversations:", error);
    return data?.conversations ?? null;
  };

export const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(
    typeof globalThis !== "undefined" ? globalThis.innerWidth <= 600 : false,
  );
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(globalThis.innerWidth <= 600);
    };
    globalThis.addEventListener("resize", handleResize);
    return () => globalThis.removeEventListener("resize", handleResize);
  }, []);

  return isMobile;
};

const matchesParticipants =
  (participants: string[]) =>
  (conversation: { participants: { publicSignKey: string }[] }) =>
    conversation.participants.length === participants.length &&
    conversation.participants.every(
      ({ publicSignKey }) => participants.includes(publicSignKey),
    );

const initialMessageLogic = (
  db: InstantReactWebDatabase<typeof schema>,
  conversationId: string,
  credentials: Credentials,
  initialMessage: string,
) => {
  const conversationKey = useConversationKey(db)(conversationId, credentials);
  const messages = useDecryptedMessages(db, 1, conversationKey, conversationId);
  useEffect(() => {
    if (
      !conversationId || !messages || messages.length || !conversationKey ||
      !initialMessage
    ) return;
    sendMessageWithKey({
      conversation: conversationId,
      conversationKey,
      credentials,
      message: { type: "text", text: initialMessage },
    }).catch((e) => {
      console.error("failed sending initial message", e);
    });
  }, [initialMessage, messages, conversationId, conversationKey]);
};

export const useGetOrCreateConversation =
  (db: () => InstantReactWebDatabase<typeof schema>) =>
  ({ credentials, participants, initialMessage }: {
    credentials: Credentials;
    participants: string[];
    initialMessage?: string;
  }): string | null => {
    const [conversation, setConversation] = useState<string | null>(null);
    const conversations = useConversations(db)(credentials.publicSignKey);
    const fixedParticipants = sort(
      unique([credentials.publicSignKey, ...participants]),
    );
    useEffect(() => {
      if (conversation || !conversations) return;
      const existingConversation = conversations.find(
        matchesParticipants(fixedParticipants),
      );
      if (existingConversation) {
        setConversation(existingConversation.id);
        return;
      }
      createConversation(db)(fixedParticipants, "Chat").then((result) => {
        if ("error" in result) {
          console.error("Error creating conversation:", result.error);
        }
      });
    }, [conversation, conversations, fixedParticipants]);
    initialMessageLogic(
      db(),
      conversation ?? crypto.randomUUID(),
      credentials,
      initialMessage ?? "",
    );
    return conversation;
  };

export const useCredentials = (name: string | null, key: string) => {
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  useEffect(() => {
    const existingCredentials = localStorage.getItem(key);
    if (existingCredentials) {
      setCredentials(JSON.parse(existingCredentials));
      return;
    }
    if (!name) return;
    createIdentity(name).then((newCredentials) => {
      setCredentials(newCredentials);
      localStorage.setItem(key, JSON.stringify(newCredentials));
    });
  }, [name]);
  return credentials;
};

export const useUserName =
  (db: () => InstantReactWebDatabase<typeof schema>) =>
  (publicSignKey: string) => {
    const { data } = db().useQuery({
      identities: { $: { where: { publicSignKey } } },
    });
    return data?.identities[0].name ?? "Anonymous";
  };

export const useConversationKey =
  ({ useQuery }: Pick<InstantReactWebDatabase<typeof schema>, "useQuery">) =>
  (
    conversation: string,
    { publicSignKey, privateEncryptKey }: Credentials,
  ): string | null => {
    const [key, setKey] = useState<string | null>(null);
    const { error, data } = useQuery({
      keys: {
        $: { where: { "owner.publicSignKey": publicSignKey, conversation } },
      },
    });
    if (error) {
      console.error("Failed to fetch conversation key", error);
    }
    const encryptedKey = data?.keys[0]?.key;
    useEffect(() => {
      if (!encryptedKey) return;
      decryptAsymmetric<string>(privateEncryptKey, encryptedKey)
        .then((key: string) => {
          setKey(key);
        });
    }, [encryptedKey, privateEncryptKey]);
    return key;
  };

export const useDecryptedMessages = (
  db: InstantReactWebDatabase<typeof schema>,
  limit: number,
  conversationKey: string | null,
  conversationId: string,
) => {
  const [messages, setMessages] = useState<null | DecipheredMessage[]>(null);
  const { data, error } = db.useQuery({
    messages: {
      conversation: {},
      $: {
        where: { conversation: conversationId },
        order: { timestamp: "desc" },
        limit,
      },
    },
  });
  if (error) console.error("error fetching alice and bot messages", error);
  const encryptedMessages = data?.messages;
  useEffect(() => {
    if (conversationKey && encryptedMessages) {
      const sorted = [...encryptedMessages].sort((a, b) =>
        b.timestamp - a.timestamp
      );
      pipe(map(decryptMessage(conversationKey)), setMessages)(sorted);
    }
  }, [conversationKey, encryptedMessages]);
  return messages;
};
