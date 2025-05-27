import { useEffect, useRef, useState } from "preact/hooks";
import { timeAgo } from "time-ago";
import {
  bubbleStyle,
  chatContainerStyle,
  isDarkMode,
  isLightColor,
  loadingStyle,
  messageContainerStyle,
  stringToColor,
} from "./design.tsx";

const Message = (
  { msg: { authorId, authorName, authorAvatar, text, timestamp }, next, isOwn }:
    {
      msg: AbstracChatMessage;
      next: AbstracChatMessage | undefined;
      isOwn: boolean;
    },
) => {
  const isFirstOfSequence = !next || next.authorId !== authorId;
  const bubbleColor = stringToColor(authorId);
  const showAvatar = isFirstOfSequence;
  const textColor = isLightColor(bubbleColor) ? "#222" : "#fff";
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        flexDirection: isOwn ? "row-reverse" : "row",
      }}
    >
      {showAvatar && (
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            marginRight: 8,
            background: bubbleColor,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {authorAvatar
            ? (
              <img
                src={authorAvatar}
                alt={authorName}
                style={{
                  width: 28,
                  height: 28,
                  objectFit: "cover",
                  borderRadius: "50%",
                }}
              />
            )
            : (
              <span
                style={{
                  color: isLightColor(bubbleColor) ? "#222" : "#fff",
                  fontWeight: 700,
                  fontSize: 14,
                }}
              >
                {authorName.slice(0, 2).toUpperCase()}
              </span>
            )}
        </div>
      )}
      <div
        style={bubbleStyle({
          textColor,
          bubbleColor,
          isOwn,
          showAvatar,
          align: isOwn ? "flex-end" : "flex-start",
        })}
      >
        <b style={{ fontSize: 11 }}>{authorName}</b>
        <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {text}
        </div>
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

export type AbstracChatMessage = {
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  text: string;
  timestamp: number;
};

const CloseButton = ({ onClose }: { onClose: () => void }) => {
  const dark = isDarkMode();
  const baseBg = dark ? "#23272f" : "#f3f4f6";
  const hoverBg = dark ? "#374151" : "#e5e7eb";
  const color = dark ? "#eee" : "#222";
  return (
    <button
      type="button"
      onClick={onClose}
      title="Close chat"
      style={{
        position: "absolute",
        top: 8,
        right: 8,
        background: baseBg,
        border: "none",
        borderRadius: "50%",
        width: 28,
        height: 28,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
        cursor: "pointer",
        fontSize: 22,
        color,
        zIndex: 10,
        transition: "background 0.2s, color 0.2s",
        padding: 0,
        fontWeight: 700,
        lineHeight: 1,
      }}
      onMouseOver={(e) => (e.currentTarget.style.background = hoverBg)}
      onMouseOut={(e) => (e.currentTarget.style.background = baseBg)}
    >
      <span style={{ fontSize: 22, fontWeight: 700, lineHeight: 1, color }}>
        ×
      </span>
    </button>
  );
};

export const AbstractChatBox = (
  { limit, setLimit, userId, onSend, messages, onClose }: {
    userId: string;
    onSend: (input: string) => void;
    messages: AbstracChatMessage[];
    limit: number;
    setLimit: (limit: number) => void;
    onClose?: () => void;
  },
) => {
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
      setLimit(limit + 100);
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
    <div style={{ ...chatContainerStyle, position: "relative" }}>
      {onClose && <CloseButton onClose={onClose} />}
      <div
        ref={messagesContainerRef}
        style={messageContainerStyle}
      >
        {messages.map((msg, i) => (
          <Message
            key={i}
            isOwn={msg.authorId === userId}
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
