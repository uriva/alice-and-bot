import { init } from "@instantdb/react";
import timeAgo from "epoch-timeago";
import { map, pipe, sideLog } from "gamla";
import { useEffect, useRef, useState } from "preact/hooks";
import schema from "../../../instant.schema.ts";
import {
  DecipheredMessage,
  decryptMessage,
  instantAppId,
  sendMessage,
  useConversationKey,
} from "../../../protocol/src/api.ts";
import {
  bubbleStyle,
  CHAT_CONTAINER_STYLE,
  getAvatar,
  INPUT_STYLE,
  isLightColor,
  LOADING_STYLE,
  MESSAGES_CONTAINER_STYLE,
  SEND_BUTTON_STYLE,
  stringToColor,
  WAITING_STYLE,
} from "./design.tsx";

const { useQuery, transact, tx } = init({ appId: instantAppId, schema });

export type Credentials = {
  publicSignKey: string;
  privateSignKey: string;
  privateEncryptKey: string;
};

const Message = (
  { msg: { publicSignKey, text, timestamp }, next, isOwn }: {
    msg: DecipheredMessage;
    next: DecipheredMessage | undefined;
    isOwn: boolean;
  },
) => {
  const isFirstOfSequence = !next ||
    next.publicSignKey !== publicSignKey;
  const align = isOwn ? "flex-end" : "flex-start";
  const bubbleColor = stringToColor(publicSignKey);
  const showAvatar = isFirstOfSequence;
  const textColor = isLightColor(bubbleColor) ? "#222" : "#fff";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: isOwn ? "row-reverse" : "row",
        alignItems: "flex-end",
        justifyContent: align,
        marginBottom: showAvatar ? 12 : 2,
      }}
    >
      {!isOwn && showAvatar && getAvatar(publicSignKey)}
      <div
        style={bubbleStyle({
          textColor,
          bubbleColor,
          isOwn,
          showAvatar,
          align,
        })}
      >
        <b style={{ fontSize: 11 }}>{publicSignKey.slice(0, 8)}</b>
        <div>{text}</div>
        <span
          style={{
            color: textColor === "#222" ? "#555" : "#eee",
            fontSize: 10,
            float: "right",
          }}
        >
          {timeAgo(timestamp)}
        </span>
      </div>
    </div>
  );
};

export const Chat = ({
  credentials,
  conversationId,
  userInstantToken,
}: {
  credentials: Credentials;
  conversationId: string;
  userInstantToken: string;
}) => {
  const [messages, setMessages] = useState<DecipheredMessage[]>([]);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [limit, setLimit] = useState(100);
  const [fetchingMore, setFetchingMore] = useState(false);
  const { data, error } = useQuery({
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

  const conversationKey = useConversationKey(
    { useQuery },
    conversationId,
    credentials.publicSignKey,
    credentials.privateEncryptKey,
  );
  const encryptedMessages = sideLog(data?.messages);

  useEffect(() => {
    if (conversationKey && encryptedMessages) {
      const sorted = [...encryptedMessages].sort((a, b) =>
        b.timestamp - a.timestamp
      );
      pipe(map(decryptMessage(conversationKey)), setMessages)(sorted);
    }
  }, [conversationKey, encryptedMessages]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const handleScroll = () => {
    if (
      messagesContainerRef.current &&
      !fetchingMore &&
      messagesContainerRef.current.scrollTop === 0 &&
      data?.messages?.length === limit
    ) {
      setFetchingMore(true);
      setLimit((prev) => prev + 100);
      setFetchingMore(false);
    }
  };

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.addEventListener("scroll", handleScroll);
      return () =>
        messagesContainerRef.current?.removeEventListener(
          "scroll",
          handleScroll,
        );
    }
  }, [limit, data, fetchingMore]);

  const onSend = async () => {
    if (conversationKey && input.trim()) {
      await sendMessage(
        { transact, tx },
        conversationKey,
        credentials.publicSignKey,
        credentials.privateSignKey,
        { type: "text", text: input },
        conversationId,
        userInstantToken,
      );
      setInput("");
      inputRef.current?.focus();
    }
  };

  return (
    <div style={CHAT_CONTAINER_STYLE}>
      conversation id: {conversationId}
      <div
        ref={messagesContainerRef}
        style={MESSAGES_CONTAINER_STYLE}
      >
        {messages.map((msg, i) => (
          <Message
            key={i}
            isOwn={msg.publicSignKey === credentials.publicSignKey}
            msg={msg}
            next={messages[i + 1]}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>
      <input
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.currentTarget.value)}
        onKeyDown={async (e) => {
          if (e.key !== "Enter") return;
          await onSend();
        }}
        placeholder="Type a message..."
        style={INPUT_STYLE}
      />
      {!conversationKey && (
        <div style={WAITING_STYLE}>
          Waiting for conversation key...
        </div>
      )}
      <button
        type="button"
        disabled={!input.trim() || !conversationKey}
        onClick={onSend}
        style={SEND_BUTTON_STYLE}
      >
        Send
      </button>
      {fetchingMore && <div style={LOADING_STYLE}>Loading more...</div>}
    </div>
  );
};
