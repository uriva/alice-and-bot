import type { InstantReactWebDatabase } from "@instantdb/react";
import { pipe } from "gamla";
import type { JSX } from "preact";
import { useState } from "preact/hooks";
import type schema from "../../../instant.schema.ts";
import {
  type Credentials,
  type DecipheredMessage,
  sendMessageWithKey,
} from "../../../protocol/src/clientApi.ts";
import {
  type AbstracChatMessage,
  AbstractChatBox,
} from "./abstractChatBox.tsx";
import { useConversationKey, useDecryptedMessages } from "./hooks.ts";

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

const processMessages =
  (db: InstantReactWebDatabase<typeof schema>) =>
  (messages: DecipheredMessage[]) => {
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
        messages={pipe(
          useDecryptedMessages,
          (x: DecipheredMessage[] | null) => x ?? [],
          processMessages(db()),
        )(db(), limit, convoKey, conversationId)}
        onSend={(input: string) => {
          if (!convoKey) {
            return null;
          }
          sendMessageWithKey({
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
