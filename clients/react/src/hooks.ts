import type { InstantReactWebDatabase } from "@instantdb/react";
import { useEffect, useState } from "preact/hooks";
import type schema from "../../../instant.schema.ts";
import {
  createConversation,
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

export const useConversations =
  (db: () => InstantReactWebDatabase<typeof schema>) =>
  (publicSignKey: string) => {
    const { data, error } = db().useQuery({
      conversations: {
        participants: {},
        $: { where: { "participants.publicSignKey": publicSignKey } },
      },
    });
    if (error) {
      console.error("Error fetching conversations:", error);
    }
    return data?.conversations ?? [];
  };

// Hook to detect if the device is mobile (by width)
export function useIsMobile(breakpoint = 600) {
  const [isMobile, setIsMobile] = useState(
    typeof globalThis !== "undefined"
      ? globalThis.innerWidth <= breakpoint
      : false,
  );

  useEffect(() => {
    function handleResize() {
      setIsMobile(globalThis.innerWidth <= breakpoint);
    }
    globalThis.addEventListener("resize", handleResize);
    return () => globalThis.removeEventListener("resize", handleResize);
  }, [breakpoint]);

  return isMobile;
}

export const useGetOrCreateConversation =
  (db: () => InstantReactWebDatabase<typeof schema>) =>
  (creds: Credentials | null, otherSide: string) => {
    const [conversation, setConversation] = useState<string | null>(null);
    const conversations = useConversations(db)(creds?.publicSignKey ?? "");
    useEffect(() => {
      if (conversation) return;
      const existingConversation = conversations.find(({ participants }) =>
        participants.some(({ publicSignKey }) => publicSignKey === otherSide)
      );
      if (existingConversation) {
        setConversation(existingConversation.id);
        return;
      }
      if (!creds) return;
      createConversation(db)([creds.publicSignKey, otherSide], "Chat");
    }, [conversation, conversations]);
    return conversation;
  };
