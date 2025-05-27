import { useEffect, useRef, useState } from "preact/hooks";
import { timeAgo } from "time-ago";
import type { DecipheredMessage } from "../../../protocol/src/api.ts";
import {
  bubbleStyle,
  CHAT_CONTAINER_STYLE,
  getAvatar,
  isLightColor,
  loadingStyle,
  MESSAGES_CONTAINER_STYLE,
  stringToColor,
} from "./design.tsx";

const Message = (
  { msg: { publicSignKey, text, timestamp }, next, isOwn }: {
    msg: DecipheredMessage;
    next: DecipheredMessage | undefined;
    isOwn: boolean;
  },
) => {
  const isFirstOfSequence = !next || next.publicSignKey !== publicSignKey;
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

export const AbstractChatBox = ({ limit, setLimit, userId, onSend, messages }: {
  userId: string;
  onSend: (input: string) => void;
  messages: DecipheredMessage[];
  limit: number;
  setLimit: (setter: (limit: number) => number) => void;
}) => {
  const [fetchingMore, setFetchingMore] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const handleScroll = () => {
    if (
      messagesContainerRef.current &&
      !fetchingMore &&
      messagesContainerRef.current.scrollTop === 0 &&
      messages?.length === limit
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
  }, [limit, messages, fetchingMore]);
  return (
    <div style={CHAT_CONTAINER_STYLE}>
      <div
        ref={messagesContainerRef}
        style={MESSAGES_CONTAINER_STYLE}
      >
        {messages.map((msg, i) => (
          <Message
            key={i}
            isOwn={msg.publicSignKey === userId}
            msg={msg}
            next={messages[i + 1]}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="flex items-center mt-2 gap-2">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") {
              return;
            }
            if (input.trim()) {
              onSend(input.trim());
              setInput("");
            }
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
          disabled={!input.trim()}
          onClick={() => onSend(input.trim())}
          className="p-2 border border-blue-500 rounded-md 
                     bg-blue-500 hover:bg-blue-600 
                     text-white 
                     focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </div>
      {fetchingMore && <div style={loadingStyle}>Loading more...</div>}
    </div>
  );
};
