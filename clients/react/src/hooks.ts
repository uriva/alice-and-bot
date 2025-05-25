import type { InstantReactWebDatabase } from "@instantdb/react";
import type schema from "../../../instant.schema.ts";
import type { Credentials } from "../../../protocol/src/api.ts";

export const useConversations =
  (db: InstantReactWebDatabase<typeof schema>) =>
  ({ publicSignKey }: Credentials) => {
    const { data, error } = db.useQuery({
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
