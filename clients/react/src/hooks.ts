import type { InstantReactWebDatabase } from "@instantdb/react";
import { sort, unique } from "gamla";
import { useEffect, useState } from "preact/hooks";
import type schema from "../../../instant.schema.ts";
import {
  createConversation,
  createIdentity,
  type Credentials,
} from "../../../protocol/src/api.ts";

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

export const useGetOrCreateConversation =
  (db: () => InstantReactWebDatabase<typeof schema>) =>
  ({ publicSignKey }: Credentials, participants: string[]): string | null => {
    const [conversation, setConversation] = useState<string | null>(null);
    const conversations = useConversations(db)(publicSignKey);
    const fixedParticipants = sort(unique([publicSignKey, ...participants]));
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
