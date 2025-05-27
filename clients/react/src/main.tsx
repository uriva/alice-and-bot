import type { InstantReactWebDatabase } from "@instantdb/react";
import { map, pipe } from "gamla";
import { useEffect, useState } from "preact/hooks";
import type schema from "../../../instant.schema.ts";
import {
  type Credentials,
  type DecipheredMessage,
  decryptMessage,
  sendMessage,
} from "../../../protocol/src/api.ts";
import { decryptAsymmetric } from "../../../protocol/src/crypto.ts";
import {
  type AbstracChatMessage,
  AbstractChatBox,
} from "./abstractChatBox.tsx";

export type ChatProps = {
  credentials: Credentials;
  onClose?: () => void;
  conversationId: string;
};

const msgToUIMessage =
  (details: Record<string, { name: string; avatar?: string }>) =>
  (msg: DecipheredMessage): AbstracChatMessage => ({
    authorId: msg.publicSignKey,
    authorName: details[msg.publicSignKey]?.name ||
      msg.publicSignKey,
    authorAvatar: details[msg.publicSignKey]?.avatar,
    text: msg.text,
    timestamp: msg.timestamp,
  });

const useDecryptedMessages = (
  db: InstantReactWebDatabase<typeof schema>,
  limit: number,
  conversationKey: string | null,
  conversationId: string,
) => {
  const [messages, setMessages] = useState<DecipheredMessage[]>([]);
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
  if (error) console.error(error);
  const encryptedMessages = data?.messages;
  useEffect(() => {
    if (conversationKey && encryptedMessages) {
      const sorted = [...encryptedMessages].sort((a, b) =>
        b.timestamp - a.timestamp
      );
      pipe(map(decryptMessage(conversationKey)), setMessages)(sorted);
    }
  }, [conversationKey, encryptedMessages]);
  const { data: identitiesData } = db.useQuery({
    identities: {
      $: {
        where: {
          publicSignKey: { $in: messages.map((msg) => msg.publicSignKey) },
        },
      },
    },
  });
  const details = Object.fromEntries(
    (identitiesData?.identities ?? []).map((identity) => [
      identity.publicSignKey,
      {
        name: identity.name || identity.publicSignKey,
        avatar: identity.avatar,
      },
    ]),
  );
  return messages.map(msgToUIMessage(details));
};

export const Chat =
  (db: InstantReactWebDatabase<typeof schema>) =>
  ({ credentials, conversationId, onClose }: ChatProps) => {
    const conversationKey = useConversationKey(db)(conversationId, credentials);
    const [limit, setLimit] = useState(100);
    return (
      <AbstractChatBox
        onClose={onClose}
        limit={limit}
        setLimit={setLimit}
        userId={credentials.publicSignKey}
        messages={useDecryptedMessages(
          db,
          limit,
          conversationKey,
          conversationId,
        )}
        onSend={(input: string) => {
          if (!conversationKey) return null;
          sendMessage({
            conversationKey,
            credentials,
            message: { type: "text", text: input },
            conversation: conversationId,
          }).catch((err) => {
            console.error("Failed to send message", err);
          });
        }}
      />
    );
  };

const useConversationKey = (
  { useQuery }: Pick<InstantReactWebDatabase<typeof schema>, "useQuery">,
) =>
(
  conversation: string,
  { publicSignKey, privateEncryptKey }: Credentials,
): string | null => {
  const [key, setKey] = useState<string | null>(null);
  const { isLoading, error, data } = useQuery(
    {
      keys: {
        $: { where: { "owner.publicSignKey": publicSignKey, conversation } },
      },
    },
  );
  if (error) {
    console.error("Failed to fetch conversation key", error);
    return null;
  }
  if (isLoading) return null;
  useEffect(() => {
    if (!data.keys[0]?.key) return;
    if (data.keys.length > 1) throw new Error("Multiple keys found");
    decryptAsymmetric<string>(privateEncryptKey, data.keys[0].key)
      .then((key: string) => {
        setKey(key);
      });
  }, [data.keys[0]?.key, privateEncryptKey]);
  return key;
};
