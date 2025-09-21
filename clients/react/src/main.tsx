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
import {
  compactPublicKey,
  useConversationKey,
  useDecryptedMessages,
  useIdentityDetailsMap,
  useTypingPresence,
} from "./hooks.ts";

export type ChatProps = {
  credentials: Credentials;
  onClose?: () => void;
  conversationId: string;
};

const msgToUIMessage =
  (details: Record<string, { name: string; avatar?: string }>) =>
  (msg: DecipheredMessage): AbstracChatMessage => ({
    authorId: msg.publicSignKey,
    authorName: details[msg.publicSignKey]?.name ??
      compactPublicKey(msg.publicSignKey),
    authorAvatar: details[msg.publicSignKey]?.avatar,
    text: msg.text,
    timestamp: msg.timestamp,
  });

const processMessages = (db: InstantReactWebDatabase<typeof schema>) =>
(
  messages: DecipheredMessage[],
  detailsCache: Record<string, { name: string; avatar?: string }>,
) => {
  const { data: identitiesData } = db.useQuery({
    identities: {
      $: {
        where: {
          publicSignKey: { $in: messages.map((msg) => msg.publicSignKey) },
        },
      },
    },
  });
  return messages.map(msgToUIMessage({
    ...detailsCache,
    ...Object.fromEntries(
      (identitiesData?.identities ?? []).map((
        { publicSignKey, name, avatar },
      ) => [
        publicSignKey,
        {
          name: name || compactPublicKey(publicSignKey),
          avatar,
        },
      ]),
    ),
  }));
};

export const Chat =
  (db: () => InstantReactWebDatabase<typeof schema>) =>
  ({ credentials, conversationId, onClose }: ChatProps): JSX.Element => {
    const convoKey = useConversationKey(db())(conversationId, credentials);
    const [limit, setLimit] = useState(100);
    const decrypted = useDecryptedMessages(
      db(),
      limit,
      convoKey,
      conversationId,
    );
    const lastMsgAuthor = decrypted?.[0]?.publicSignKey ?? null;
    const typing = useTypingPresence(
      db(),
      conversationId,
      credentials.publicSignKey,
      lastMsgAuthor,
    );
    const identityDetails = useIdentityDetailsMap(db)(
      (decrypted ?? []).map(({ publicSignKey }) => publicSignKey),
    );
    const conversationTitle = db().useQuery({
      conversations: {
        $: { where: { id: conversationId } },
      },
    }).data?.conversations[0]?.title || "Chat";
    return (
      <AbstractChatBox
        title={conversationTitle}
        onClose={onClose}
        limit={limit}
        loadMore={() => {
          setLimit(limit + 100);
        }}
        userId={credentials.publicSignKey}
        typingUsers={typing.typingNames}
        isLoading={!decrypted}
        messages={pipe(
          () => decrypted ?? [],
          (x: DecipheredMessage[]) => x,
          (msgs) => processMessages(db())(msgs, identityDetails),
        )()}
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
          typing.onBlurOrSend();
        }}
        onInputActivity={() => typing.onUserInput()}
      />
    );
  };
