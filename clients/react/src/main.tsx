import type { InstantReactWebDatabase } from "@instantdb/react";
import { map, pipe } from "gamla";
import type { JSX } from "preact";
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
    authorName: details[msg.publicSignKey]?.name || "User",
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
  (db: () => InstantReactWebDatabase<typeof schema>) =>
  ({ credentials, conversationId, onClose }: ChatProps): JSX.Element => {
    const convoKey = useConversationKey(db())(conversationId, credentials);
    const conversationTitle = db().useQuery({
      conversations: {
        $: { where: { id: conversationId } },
      },
    }).data?.conversations[0]?.title || "Chat";
    const [limit, setLimit] = useState(100);
    return (
      <AbstractChatBox
        title={conversationTitle}
        onClose={onClose}
        limit={limit}
        loadMore={() => {
          setLimit(limit + 100);
        }}
        userId={credentials.publicSignKey}
        messages={useDecryptedMessages(db(), limit, convoKey, conversationId)}
        onSend={(input: string) => {
          if (!convoKey) return null;
          sendMessage({
            conversationKey: convoKey,
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

const useConversationKey =
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
