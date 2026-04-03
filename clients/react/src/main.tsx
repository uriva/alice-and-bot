import type { InstantReactWebDatabase } from "@instantdb/react";
import { sortKey } from "@uri/gamla";
import type { ComponentChildren, JSX } from "preact";
import { useRef } from "preact/hooks";
import { FaLock, FaQuestionCircle } from "react-icons/fa";
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
  type ActiveStream,
  type EditHistoryEntry,
} from "./abstractChatBox.tsx";
import type { CustomColors } from "./design.tsx";
import {
  compactPublicKey,
  type EphemeralStreamEvent,
  useConversationKey,
  useDecryptedMessages,
  useEphemeralStreams,
  useIdentityDetailsMap,
  useTypingPresence,
} from "./hooks.ts";
import { useVoiceCall } from "./webrtc.ts";

export type ChatProps = {
  credentials: Credentials;
  onClose?: () => void;
  conversationId: string;
  emptyMessage?: ComponentChildren;
  darkModeOverride?: boolean;
  customColors?: CustomColors;
  enableAttachments?: boolean;
  enableAudioRecording?: boolean;
  enableVoiceCall?: boolean;
};

const hasAttachments = (
  msg: DecipheredMessage,
): msg is DecipheredMessage & { attachments?: Attachment[] } =>
  msg.type === "text" || msg.type === "edit";

const msgToUIMessage = (
  details: Record<string, { name: string; avatar?: string }>,
  _ownId: string,
) =>
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

const isTextOrEdit = (m: DecipheredMessage): boolean =>
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
  (original: DecipheredMessage): DecipheredMessage => {
    if (original.type !== "text") return original;
    const msgEdits = editsForMessage(edits)(original.id);
    if (!msgEdits.length) return original;
    const latest = msgEdits[msgEdits.length - 1];
    return { ...original, text: latest.text, attachments: latest.attachments };
  };

const foldEdits = (
  messages: DecipheredMessage[],
) => {
  const edits = messages.filter((m): m is TextOrEditMessage =>
    m.type === "edit"
  );
  const originalsAndCalls = messages.filter((m) => m.type === "text");
  return originalsAndCalls.map((original) => {
    const msg = applyLatestEdit(edits)(original);
    return {
      msg,
      editHistory: original.type === "text" &&
          edits.some((e) => e.type === "edit" && e.editOf === original.id)
        ? buildEditHistory(edits)(original as TextOrEditMessage)
        : undefined,
    };
  });
};

const msgToUIMessageWithHistory =
  (details: Record<string, { name: string; avatar?: string }>, ownId: string) =>
  (
    { msg, editHistory }: {
      msg: DecipheredMessage;
      editHistory?: EditHistoryEntry[];
    },
  ): AbstracChatMessage => ({
    ...msgToUIMessage(details, ownId)(msg),
    editHistory,
  });

const latestSpinners = (
  messages: DecipheredMessage[],
  details: Record<string, { name: string; avatar?: string }>,
  uiOverrides: Map<string, { active?: boolean; percentage?: number }>,
): ActiveSpinner[] => {
  const spinnerMessages = messages.filter((m) => m.type === "spinner");
  const byElement = new Map<string, (typeof spinnerMessages)[number]>();
  for (
    const m of sortKey((x: DecipheredMessage) => x.timestamp)(spinnerMessages)
  ) {
    if (m.type === "spinner") byElement.set(m.elementId, m);
  }
  const result: ActiveSpinner[] = [];
  for (const [, m] of byElement) {
    const override = uiOverrides.get(m.elementId);
    const active = override?.active ?? m.active;
    result.push({
      authorName: details[m.publicSignKey]?.name ??
        compactPublicKey(m.publicSignKey),
      text: m.text,
      elementId: m.elementId,
      timestamp: m.timestamp,
      active,
    });
  }
  return result;
};

const latestProgress = (
  messages: DecipheredMessage[],
  details: Record<string, { name: string; avatar?: string }>,
  uiOverrides: Map<string, { active?: boolean; percentage?: number }>,
): ActiveProgress[] => {
  const progressMessages = messages.filter((m) => m.type === "progress");
  const byElement = new Map<string, (typeof progressMessages)[number]>();
  for (
    const m of sortKey((x: DecipheredMessage) => x.timestamp)(progressMessages)
  ) {
    if (m.type === "progress") byElement.set(m.elementId, m);
  }
  const result: ActiveProgress[] = [];
  for (const [, m] of byElement) {
    const override = uiOverrides.get(m.elementId);
    const pct = override?.percentage ?? m.percentage;
    result.push({
      authorName: details[m.publicSignKey]?.name ??
        compactPublicKey(m.publicSignKey),
      text: m.text,
      percentage: pct,
      elementId: m.elementId,
      timestamp: m.timestamp,
    });
  }
  return result;
};

const enforceMonotonic =
  (maxRef: { current: Map<string, number> }) =>
  (entries: ActiveProgress[]): ActiveProgress[] =>
    entries.map((entry) => {
      const monotonic = Math.max(
        maxRef.current.get(entry.elementId) ?? 0,
        entry.percentage,
      );
      maxRef.current.set(entry.elementId, monotonic);
      return { ...entry, percentage: monotonic };
    });

const processMessages = (db: InstantReactWebDatabase<typeof schema>) =>
(
  messages: DecipheredMessage[],
  detailsCache: Record<string, { name: string; avatar?: string }>,
  conversationId: string,
  ownId: string,
  ephemeralStreams: EphemeralStreamEvent[],
) => {
  const progressMaxRef = useRef(new Map<string, number>());
  const { data: uiElementsData } = db.useQuery({
    uiElements: {
      $: { where: { conversation: conversationId } },
    },
  });
  const uiElements = uiElementsData?.uiElements ?? [];
  const streamAuthorIds = [
    ...ephemeralStreams.map((el) => el.authorId).filter(Boolean) as string[],
  ];
  const { data: identitiesData } = db.useQuery({
    identities: {
      $: {
        where: {
          publicSignKey: {
            $in: [
              ...messages.map((msg) => msg.publicSignKey),
              ...streamAuthorIds,
            ],
          },
        },
      },
    },
  });
  const uiOverrides = new Map(
    uiElements.map((
      el: {
        elementId: string;
        active?: boolean;
        percentage?: number;
        text?: string;
        type?: string;
      },
    ) => [el.elementId, {
      active: el.active,
      percentage: el.percentage,
      text: el.text,
      type: el.type,
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
  const uiMessages = messages.filter(isTextOrEdit);
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
      !messageElementIds.has(el.elementId) && el.active !== false
    )
    .map((
      el: {
        elementId: string;
        text?: string;
        updatedAt: number;
        active?: boolean;
      },
    ): ActiveSpinner => ({
      authorName: "",
      text: el.text ?? "",
      elementId: el.elementId,
      timestamp: el.updatedAt,
      active: el.active !== false,
    }));
  const standaloneStreams: ActiveStream[] = ephemeralStreams
    .filter((el: { elementId: string; active?: boolean; text?: string }) =>
      !messageElementIds.has(el.elementId) &&
      (el.active !== false || (el.text && el.text.trim() !== ""))
    )
    .map((
      el: {
        elementId: string;
        text?: string;
        updatedAt: number;
        authorId?: string;
      },
    ): ActiveStream => {
      const authorProfile = el.authorId ? details[el.authorId] : undefined;
      return {
        authorName: authorProfile?.name || "Assistant",
        authorAvatar: authorProfile?.avatar,
        authorPublicKey: el.authorId,
        text: el.text ?? "",
        elementId: el.elementId,
        timestamp: el.updatedAt,
      };
    });
  return {
    chatMessages: foldEdits(uiMessages).map(
      msgToUIMessageWithHistory(details, ownId),
    ),
    activeSpinners: [
      ...latestSpinners(messages, details, uiOverrides),
      ...standaloneSpinners,
    ],
    activeProgress: enforceMonotonic(progressMaxRef)([
      ...latestProgress(messages, details, uiOverrides),
      ...standaloneProgress,
    ]),
    activeStreams: standaloneStreams,
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
    enableVoiceCall = true,
  }: ChatProps,
): JSX.Element => {
  const database = db();
  const { data: keyData, isLoading: isKeyLoading } = database.useQuery({
    keys: {
      $: {
        where: {
          "owner.publicSignKey": credentials.publicSignKey,
          conversation: conversationId,
        },
      },
    },
  });
  const hasAccess = isKeyLoading ? true : (keyData?.keys.length ?? 0) > 0;

  const convQuery = database.useQuery({
    conversations: {
      participants: {},
      $: { where: { id: conversationId } },
    },
  });
  const isConvLoading = convQuery.isLoading;
  const conversation = convQuery.data?.conversations[0];
  const convNotFound = !isConvLoading && !conversation;

  const convoKey = useConversationKey(database)(conversationId, credentials);
  const { messages: decrypted, canLoadMore, loadMore } = useDecryptedMessages(
    database,
    convoKey,
    conversationId,
  );
  const lastMsgAuthor = decrypted?.[0]?.publicSignKey ?? null;
  const typing = useTypingPresence(
    database,
    conversationId,
    credentials.publicSignKey,
    lastMsgAuthor,
  );
  const identityDetails = useIdentityDetailsMap(db)(
    (decrypted ?? []).map(({ publicSignKey }) => publicSignKey),
  );

  const conversationTitle = conversation?.title || "Chat";
  const isGroupChat = (conversation?.participants.length ?? 0) > 2;
  const ephemeralStreams = useEphemeralStreams(database, conversationId);

  const voiceCall = useVoiceCall({
    db: database,
    conversationId,
    credentials,
    conversationKey: convoKey,
    messages: decrypted ?? [],
  });

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

  if (convNotFound || !hasAccess) {
    return (
      <div
        data-testid={convNotFound ? "chat-not-found" : "access-denied"}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          width: "100%",
          color: customColors?.text ?? "#6b7280",
          background: customColors?.background ??
            (darkModeOverride ? "#111" : "#f9fafb"),
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>
          {convNotFound ? <FaQuestionCircle size={48} /> : <FaLock size={48} />}
        </div>
        <div
          style={{
            fontSize: "1.25rem",
            fontWeight: 600,
            marginBottom: "0.5rem",
          }}
        >
          {convNotFound ? "Chat Not Found" : "Access Denied"}
        </div>
        <div style={{ fontSize: "0.9rem" }}>
          {convNotFound
            ? "This conversation does not exist."
            : "You do not have the encryption keys for this conversation."}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            style={{
              marginTop: "1.5rem",
              padding: "0.5rem 1rem",
              background: customColors?.primary ?? "#1a1a1a",
              color: "white",
              borderRadius: "0.375rem",
              border: "none",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            Go Back
          </button>
        )}
      </div>
    );
  }

  const { chatMessages, activeSpinners, activeProgress, activeStreams } =
    processMessages(
      database,
    )(
      decrypted ?? [],
      identityDetails,
      conversationId,
      credentials.publicSignKey,
      ephemeralStreams,
    );

  return (
    <AbstractChatBox
      title={conversationTitle}
      emptyMessage={emptyMessage}
      onClose={onClose}
      canLoadMore={canLoadMore}
      loadMore={loadMore}
      userId={credentials.publicSignKey}
      typingUsers={typing.typingNames}
      isLoading={!decrypted}
      darkModeOverride={darkModeOverride}
      customColors={customColors}
      enableAttachments={enableAttachments}
      enableAudioRecording={enableAudioRecording}
      enableVoiceCall={enableVoiceCall}
      voiceCallState={voiceCall.callState}
      voiceCallDuration={voiceCall.callDuration}
      voiceCallMuted={voiceCall.isMuted}
      remoteStream={voiceCall.remoteStream}
      onStartCall={voiceCall.startCall}
      onAcceptCall={voiceCall.acceptCall}
      onRejectCall={voiceCall.rejectCall}
      onEndCall={voiceCall.endCall}
      onToggleMute={voiceCall.toggleMute}
      onSendWithAttachments={handleSendWithAttachments}
      onDecryptAttachment={handleDecryptAttachment}
      onEdit={handleEdit}
      onSendLocation={(latitude: number, longitude: number, label?: string) => {
        if (!convoKey) return;
        sendMessageWithKey({
          conversationKey: convoKey,
          credentials,
          message: {
            type: "text",
            text: "",
            attachments: [{ type: "location", latitude, longitude, label }],
          },
          conversation: conversationId,
        }).catch((err) => {
          console.error("Failed to send location", err);
        });
      }}
      messages={chatMessages}
      activeSpinners={activeSpinners}
      activeProgress={activeProgress}
      activeStreams={activeStreams}
      isGroupChat={isGroupChat}
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
