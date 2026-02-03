import type { InstantReactWebDatabase } from "@instantdb/react";
import { pipe } from "@uri/gamla";
import type { ComponentChildren, JSX } from "preact";
import { useState } from "preact/hooks";
import type schema from "../../../instant.schema.ts";
import {
  type Attachment,
  type Credentials,
  type DecipheredMessage,
  downloadAttachment,
  sendMessageWithKey,
  uploadAttachment,
} from "../../../protocol/src/clientApi.ts";
import {
  type AbstracChatMessage,
  AbstractChatBox,
} from "./abstractChatBox.tsx";
import type { CustomColors } from "./design.tsx";
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
  emptyMessage?: ComponentChildren;
  darkModeOverride?: boolean;
  customColors?: CustomColors;
  enableAttachments?: boolean;
  enableAudioRecording?: boolean;
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
    attachments: msg.attachments,
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

export const Chat = (db: () => InstantReactWebDatabase<typeof schema>) =>
(
  {
    credentials,
    conversationId,
    onClose,
    emptyMessage,
    darkModeOverride,
    customColors,
    enableAttachments = true,
    enableAudioRecording = true,
  }: ChatProps,
): JSX.Element => {
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

  const handleSendWithAttachments = async (
    text: string,
    files: File[],
  ): Promise<void> => {
    if (!convoKey) return;
    const attachments: Attachment[] = [];
    for (const file of files) {
      const result = await uploadAttachment({
        credentials,
        conversationId,
        conversationKey: convoKey,
        file,
      });
      if ("error" in result) {
        console.error("Failed to upload attachment", result.error);
        continue;
      }
      attachments.push(result);
    }
    await sendMessageWithKey({
      conversationKey: convoKey,
      credentials,
      message: { type: "text", text, attachments },
      conversation: conversationId,
    });
    typing.onBlurOrSend();
  };

  const handleDecryptAttachment = async (url: string): Promise<string> => {
    if (!convoKey) throw new Error("No conversation key");
    const arrayBuffer = await downloadAttachment({
      url,
      conversationKey: convoKey,
    });
    const blob = new Blob([arrayBuffer]);
    return URL.createObjectURL(blob);
  };

  return (
    <AbstractChatBox
      title={conversationTitle}
      emptyMessage={emptyMessage}
      onClose={onClose}
      limit={limit}
      loadMore={() => {
        setLimit(limit + 100);
      }}
      userId={credentials.publicSignKey}
      typingUsers={typing.typingNames}
      isLoading={!decrypted}
      darkModeOverride={darkModeOverride}
      customColors={customColors}
      enableAttachments={enableAttachments}
      enableAudioRecording={enableAudioRecording}
      onSendWithAttachments={handleSendWithAttachments}
      onDecryptAttachment={handleDecryptAttachment}
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
