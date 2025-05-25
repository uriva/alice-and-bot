import type { InstantReactWebDatabase } from "@instantdb/react";
import { map, pipe, sideLog } from "gamla";
import { useEffect, useRef, useState } from "preact/hooks";
import { timeAgo } from "time-ago";
import type schema from "../../../instant.schema.ts";
import {
  type Credentials,
  type DecipheredMessage,
  decryptMessage,
  keysQuery,
  sendMessage,
} from "../../../protocol/src/api.ts";
import { decryptAsymmetric } from "../../../protocol/src/crypto.ts";
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

export type ChatProps = {
  credentials: Credentials;
  conversationId: string;
  style?: Record<string, string>;
  className?: string;
};

export const Chat = (db: InstantReactWebDatabase<typeof schema>) =>
({
  credentials,
  conversationId,
  style,
  className,
}: ChatProps) => {
  const [messages, setMessages] = useState<DecipheredMessage[]>([]);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [limit, setLimit] = useState(100);
  const [fetchingMore, setFetchingMore] = useState(false);
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
  const conversationKey = useConversationKey(db)(conversationId, credentials);
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
      await sendMessage(db)({
        conversationKey,
        credentials,
        message: { type: "text", text: input },
        conversation: conversationId,
      });
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

const useConversationKey = (
  { useQuery }: Pick<InstantReactWebDatabase<typeof schema>, "useQuery">,
) =>
(
  conversation: string,
  credentials: Credentials,
): string | null => {
  const [key, setKey] = useState<string | null>(null);
  const { isLoading, error, data } = useQuery(
    keysQuery(credentials, conversation),
  );
  if (error) {
    console.error("Failed to fetch conversation key", error);
    return null;
  }
  if (isLoading) return null;
  useEffect(() => {
    if (!data.keys[0]?.key) return;
    if (data.keys.length > 1) throw new Error("Multiple keys found");
    decryptAsymmetric<string>(credentials.privateEncryptKey, data.keys[0].key)
      .then((key: string) => {
        setKey(key);
      });
  }, [data.keys[0]?.key, credentials.privateEncryptKey]);
  return key;
};

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
