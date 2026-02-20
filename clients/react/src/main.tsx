import type { InstantReactWebDatabase } from "@instantdb/react";
import { sortKey } from "@uri/gamla";
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
  type ActiveProgress,
  type ActiveSpinner,
  type EditHistoryEntry,
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

const hasAttachments = (
  msg: DecipheredMessage,
): msg is DecipheredMessage & { attachments?: Attachment[] } =>
  msg.type === "text" || msg.type === "edit";

const msgToUIMessage =
  (details: Record<string, { name: string; avatar?: string }>) =>
  (msg: DecipheredMessage): AbstracChatMessage => ({
    id: msg.id,
    authorId: msg.publicSignKey,
    authorName: details[msg.publicSignKey]?.name ??
      compactPublicKey(msg.publicSignKey),
    authorAvatar: details[msg.publicSignKey]?.avatar,
    text: msg.text,
    timestamp: msg.timestamp,
    attachments: hasAttachments(msg) ? msg.attachments : undefined,
  });

type TextOrEditMessage = DecipheredMessage & {
  type: "text" | "edit";
};

const isTextOrEdit = (m: DecipheredMessage): m is TextOrEditMessage =>
  m.type === "text" || m.type === "edit";

const editsForMessage = (edits: TextOrEditMessage[]) => (msgId: string) =>
  sortKey((e: TextOrEditMessage) => e.timestamp)(
    edits.filter((e) => e.type === "edit" && e.editOf === msgId),
  );

const buildEditHistory =
  (edits: TextOrEditMessage[]) =>
  (original: TextOrEditMessage): EditHistoryEntry[] => [
    ...editsForMessage(edits)(original.id).slice(0, -1).map((e) => ({
      text: e.text,
      timestamp: e.timestamp,
      attachments: e.attachments,
    })),
    {
      text: original.text,
      timestamp: original.timestamp,
      attachments: original.attachments,
    },
  ];

const applyLatestEdit =
  (edits: TextOrEditMessage[]) =>
  (original: TextOrEditMessage): TextOrEditMessage => {
    const msgEdits = editsForMessage(edits)(original.id);
    if (!msgEdits.length) return original;
    const latest = msgEdits[msgEdits.length - 1];
    return { ...original, text: latest.text, attachments: latest.attachments };
  };

const foldEdits = (messages: TextOrEditMessage[]) => {
  const edits = messages.filter((m) => m.type === "edit");
  const originals = messages.filter((m) => m.type === "text");
  return originals.map((original) => ({
    msg: applyLatestEdit(edits)(original),
    editHistory:
      edits.some((e) => e.type === "edit" && e.editOf === original.id)
        ? buildEditHistory(edits)(original)
        : undefined,
  }));
};

const msgToUIMessageWithHistory =
  (details: Record<string, { name: string; avatar?: string }>) =>
  (
    { msg, editHistory }: {
      msg: DecipheredMessage;
      editHistory?: EditHistoryEntry[];
    },
  ): AbstracChatMessage => ({
    ...msgToUIMessage(details)(msg),
    editHistory,
  });

const latestSpinners = (
  messages: DecipheredMessage[],
  details: Record<string, { name: string; avatar?: string }>,
  uiOverrides: Map<string, { active?: boolean; percentage?: number }>,
): ActiveSpinner[] => {
  const byAuthor = new Map<string, DecipheredMessage>();
  for (
    const m of sortKey((x: DecipheredMessage) => x.timestamp)(
      messages.filter((m) => m.type === "spinner"),
    )
  ) {
    byAuthor.set(m.publicSignKey, m);
  }
  const result: ActiveSpinner[] = [];
  for (const [key, m] of byAuthor) {
    if (m.type === "spinner") {
      const override = uiOverrides.get(m.elementId);
      const isActive = override?.active ?? m.active;
      if (isActive) {
        result.push({
          authorName: details[key]?.name ?? compactPublicKey(key),
          text: m.text,
          elementId: m.elementId,
          timestamp: m.timestamp,
        });
      }
    }
  }
  return result;
};

const latestProgress = (
  messages: DecipheredMessage[],
  details: Record<string, { name: string; avatar?: string }>,
  uiOverrides: Map<string, { active?: boolean; percentage?: number }>,
): ActiveProgress[] => {
  const byAuthor = new Map<string, DecipheredMessage>();
  for (
    const m of sortKey((x: DecipheredMessage) => x.timestamp)(
      messages.filter((m) => m.type === "progress"),
    )
  ) {
    byAuthor.set(m.publicSignKey, m);
  }
  const result: ActiveProgress[] = [];
  for (const [key, m] of byAuthor) {
    if (m.type === "progress") {
      const override = uiOverrides.get(m.elementId);
      const pct = override?.percentage ?? m.percentage;
      result.push({
        authorName: details[key]?.name ?? compactPublicKey(key),
        text: m.text,
        percentage: pct,
        elementId: m.elementId,
        timestamp: m.timestamp,
      });
    }
  }
  return result;
};

const processMessages = (db: InstantReactWebDatabase<typeof schema>) =>
(
  messages: DecipheredMessage[],
  detailsCache: Record<string, { name: string; avatar?: string }>,
  conversationId: string,
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
  const { data: uiElementsData } = db.useQuery({
    uiElements: {
      $: { where: { "conversation.id": conversationId } },
    },
  });
  const uiElements = uiElementsData?.uiElements ?? [];
  const uiOverrides = new Map(
    uiElements.map((
      el: {
        elementId: string;
        active?: boolean;
        percentage?: number;
        text?: string;
      },
    ) => [el.elementId, {
      active: el.active,
      percentage: el.percentage,
      text: el.text,
    }]),
  );
  const details = {
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
  };
  const textAndEdits = messages.filter(isTextOrEdit);
  const messageElementIds = new Set(
    messages
      .filter((m): m is DecipheredMessage & { elementId: string } =>
        "elementId" in m
      )
      .map((m) => m.elementId),
  );
  const standaloneProgress: ActiveProgress[] = uiElements
    .filter((el: { elementId: string; type: string; percentage?: number }) =>
      el.type === "progress" &&
      !messageElementIds.has(el.elementId)
    )
    .map((
      el: {
        elementId: string;
        text?: string;
        percentage?: number;
        updatedAt: number;
      },
    ): ActiveProgress => ({
      authorName: "",
      text: el.text ?? "",
      percentage: el.percentage ?? 0,
      elementId: el.elementId,
      timestamp: el.updatedAt,
    }));
  const standaloneSpinners: ActiveSpinner[] = uiElements
    .filter((el: { elementId: string; type: string; active?: boolean }) =>
      el.type === "spinner" &&
      !messageElementIds.has(el.elementId) &&
      el.active !== false
    )
    .map((
      el: { elementId: string; text?: string; updatedAt: number },
    ): ActiveSpinner => ({
      authorName: "",
      text: el.text ?? "",
      elementId: el.elementId,
      timestamp: el.updatedAt,
    }));
  return {
    chatMessages: foldEdits(textAndEdits).map(
      msgToUIMessageWithHistory(details),
    ),
    activeSpinners: [
      ...latestSpinners(messages, details, uiOverrides),
      ...standaloneSpinners,
    ],
    activeProgress: [
      ...latestProgress(messages, details, uiOverrides),
      ...standaloneProgress,
    ],
  };
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
    audioDuration?: number,
  ): Promise<void> => {
    if (!convoKey) return;
    const attachments: Attachment[] = [];
    for (const file of files) {
      const result = await uploadAttachment({
        credentials,
        conversationId,
        conversationKey: convoKey,
        file,
        durationOverride: audioDuration,
      });
      if ("error" in result) {
        alert(`Failed to upload ${file.name}: ${result.error}`);
        return;
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

  const handleEdit = async (messageId: string, newText: string) => {
    if (!convoKey) return;
    await sendMessageWithKey({
      conversationKey: convoKey,
      credentials,
      message: { type: "edit", editOf: messageId, text: newText },
      conversation: conversationId,
    });
  };

  const { chatMessages, activeSpinners, activeProgress } = processMessages(
    db(),
  )(decrypted ?? [], identityDetails, conversationId);

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
      onEdit={handleEdit}
      messages={chatMessages}
      activeSpinners={activeSpinners}
      activeProgress={activeProgress}
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
