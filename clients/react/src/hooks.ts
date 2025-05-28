import type { InstantReactWebDatabase } from "@instantdb/react";
import type schema from "../../../instant.schema.ts";
import type { Credentials } from "../../../protocol/src/api.ts";

import { useEffect, useState } from "preact/hooks";

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
    typeof globalThis !== "undefined" ? globalThis.innerWidth <= breakpoint : false
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
