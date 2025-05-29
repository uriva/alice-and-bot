import type { InstantReactWebDatabase } from "@instantdb/react";
import { useEffect, useState } from "preact/hooks";
import type schema from "../../../instant.schema.ts";
import {
  createConversation,
  createIdentity,
  type Credentials
} from "../../../protocol/src/api.ts";
import { unique } from "gamla";

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

export const useConversations =
  (db: () => InstantReactWebDatabase<typeof schema>) =>
    (publicSignKey: string): { id: string; title: string; participants: { publicSignKey: string }[] }[] => {
      const { data, error } = db().useQuery({
        conversations: { participants: {}, $: { where: { "participants.publicSignKey": publicSignKey } }, },
      });
      if (error) console.error("Error fetching conversations:", error);
      return data?.conversations ?? [];
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

const matchesParticipants = (participants: string[]) =>
  (conversation: { participants: { publicSignKey: string }[] }) =>
    conversation.participants.length === participants.length &&
    conversation.participants.every(
      (p) => participants.includes(p.publicSignKey),
    );

export const useGetOrCreateConversation =
  (db: () => InstantReactWebDatabase<typeof schema>) =>
    (creds: Credentials, participants: string[]): string | null => {
      const [conversation, setConversation] = useState<string | null>(null);
      const conversations = useConversations(db)(creds.publicSignKey);
      const fixedParticipants = unique([creds.publicSignKey, ...participants]);
      useEffect(() => {
        if (conversation) return;
        const existingConversation = conversations.find(matchesParticipants(fixedParticipants));
        if (existingConversation) {
          setConversation(existingConversation.id);
          return;
        }
        createConversation(db)(fixedParticipants, "Chat");
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
      localStorage.setItem(key, JSON.stringify(newCredentials),);
    });
  }, [name]);
  return credentials;
};