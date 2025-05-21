import { init } from "@instantdb/react";
import { map, pipe, sideLog } from "gamla";
import { timeAgo } from "jsr:@egamagz/time-ago";
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
  isLightColor,
  loadingStyle,
  MESSAGES_CONTAINER_STYLE,
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
  style,
  className,
}: {
  credentials: Credentials;
  conversationId: string;
  style?: Record<string, string>;
  className?: string;
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
      );
      setInput("");
      inputRef.current?.focus();
    }
  };

  return (
    <div style={{ ...CHAT_CONTAINER_STYLE, ...style }} className={className}>
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
      {/* Flex container for input and send button */}
      <div className="flex items-center mt-2 gap-2">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) =>
            setInput(e.currentTarget.value)}
          onKeyDown={async (e) => {
            if (e.key !== "Enter") {
              return;
            }
            await onSend();
          }}
          placeholder="Type a message..."
          className="flex-grow p-2 border rounded-md 
                     bg-gray-50 dark:bg-gray-700 
                     border-gray-300 dark:border-gray-600 
                     text-gray-900 dark:text-white 
                     placeholder-gray-500 dark:placeholder-gray-400
                     focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
        />
        <button
          type="button"
          disabled={!input.trim() || !conversationKey}
          onClick={onSend}
          className="p-2 border border-blue-500 rounded-md 
                     bg-blue-500 hover:bg-blue-600 
                     text-white 
                     focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </div>
      {!conversationKey && (
        <div style={WAITING_STYLE}>
          Waiting for conversation key...
        </div>
      )}
      {fetchingMore && <div style={loadingStyle}>Loading more...</div>}
    </div>
  );
};
