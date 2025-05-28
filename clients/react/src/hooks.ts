import type { InstantReactWebDatabase } from "@instantdb/react";
import { useEffect, useState } from "preact/hooks";
import type schema from "../../../instant.schema.ts";
import {
  createConversation,
  type Credentials,
} from "../../../protocol/src/api.ts";

export const useConversations =
  (db: () => InstantReactWebDatabase<typeof schema>) =>
  ({ publicSignKey }: Credentials) => {
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
  (
    creds: Credentials,
    otherSide: string,
  ) => {
    const [conversation, setConversation] = useState<string | null>(null);
    const conversations = useConversations(db)(creds);
    useEffect(() => {
      if (conversation) return;
      const existingConversation = conversations.find(({ participants }) =>
        participants.some(({ publicSignKey }) => publicSignKey === otherSide)
      );
      if (existingConversation) {
        setConversation(existingConversation.id);
        return;
      }
      createConversation(db)([creds.publicSignKey, otherSide], "Chat");
    }, [conversation, conversations]);
    return conversation;
  };
