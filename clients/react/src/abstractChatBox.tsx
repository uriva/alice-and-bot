import { useEffect, useRef, useState } from "preact/hooks";
import { FaPaperPlane } from "react-icons/fa";
import ReactMarkdown from "react-markdown";
import { timeAgo } from "time-ago";
import {
  chatContainerStyle,
  isLightColor,
  loadingStyle,
  stringToColor,
} from "./design.tsx";
import { useDarkMode, useIsMobile } from "./hooks.ts";

const Message = (
  { msg: { authorId, authorName, authorAvatar, text, timestamp }, next, isOwn }:
    {
      msg: AbstracChatMessage;
      next: AbstracChatMessage | undefined;
      isOwn: boolean;
    },
) => {
  const isFirstOfSequence = !next || next.authorId !== authorId;
  const isDark = useDarkMode();
  const baseColor = stringToColor(authorId, isDark);
  const bubbleColor = baseColor;
  const showAvatar = isFirstOfSequence;
  const textColor = isLightColor(bubbleColor)
    ? (isDark ? "#fff" : "#222")
    : (isDark ? "#fff" : "#fff");
  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        flexDirection: isOwn ? "row-reverse" : "row",
      }}
    >
      {showAvatar && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            width: 32,
            height: 32,
            padding: 4,
            borderRadius: "50%",
            background: bubbleColor,
            boxShadow: isDark ? "0 1px 4px #0004" : "0 1px 4px #0001",
            transition: "background 0.2s, box-shadow 0.2s",
          }}
        >
          {authorAvatar
            ? (
              <img
                src={authorAvatar}
                alt={authorName}
                style={{
                  objectFit: "cover",
                  borderRadius: "50%",
                }}
              />
            )
            : (
              <span
                style={{
                  color: isLightColor(bubbleColor)
                    ? (isDark ? "#fff" : "#222")
                    : (isDark ? "#fff" : "#fff"),
                  fontWeight: 700,
                  fontSize: 15,
                  letterSpacing: 0.5,
                }}
              >
                {authorName.slice(0, 2).toUpperCase()}
              </span>
            )}
        </div>
      )}
      <div
        dir="auto"
        style={{
          background: bubbleColor,
          color: textColor,
          alignSelf: isOwn ? "flex-end" : "flex-start",
          borderRadius: 16,
          padding: "6px 12px",
          marginLeft: isOwn ? 0 : (!isOwn && showAvatar ? 0 : 36),
          marginRight: isOwn ? (showAvatar ? 0 : 36) : 0,
        }}
      >
        <b style={{ fontSize: 11 }}>{authorName}</b>
        <ReactMarkdown>{text}</ReactMarkdown>
        <span
          style={{
            color: isDark ? "#bbb" : (textColor === "#222" ? "#555" : "#eee"),
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
  const isDark = useDarkMode();
  const baseBg = isDark ? "#23272f" : "#f3f4f6";
  const hoverBg = isDark ? "#374151" : "#e5e7eb";
  const color = isDark ? "#eee" : "#222";
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

const titleStyle = (isDark: boolean) => ({
  textAlign: "center",
  fontWeight: "bold",
  fontSize: "1.2em",
  padding: "0.7em 0 0.5em 0",
  background: isDark ? "#23272f" : "#fff",
  color: isDark ? "#f3f4f6" : "#222",
  boxShadow: isDark
    ? "0 1px 0 0 #23272f, 0 2px 8px 0 #0002"
    : "0 1px 0 0 #e5e7eb, 0 2px 8px 0 #0001",
  borderBottom: "none",
  borderTopLeftRadius: isDark ? 0 : 16,
  borderTopRightRadius: isDark ? 0 : 16,
});

const messageContainerStyle = (isDark: boolean) => ({
  display: "flex",
  flexGrow: 1,
  overflowY: "auto",
  scrollbarGutter: "stable",
  gap: 8,
  transition: "background 0.2s",
  flexDirection: "column-reverse",
  background: isDark ? "#181c23" : "#f8fafc",
  scrollbarColor: isDark ? "#374151 #181c23" : "#cbd5e1 #f8fafc",
  padding: 4,
});

export const AbstractChatBox = (
  { limit, loadMore, userId, onSend, messages, onClose, title }: {
    userId: string;
    onSend: (input: string) => void;
    messages: AbstracChatMessage[];
    limit: number;
    loadMore: () => void;
    onClose?: () => void;
    title: string;
  },
) => {
  const isMobile = useIsMobile();
  const [fetchingMore, setFetchingMore] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const handleScroll = () => {
    if (
      messagesContainerRef.current &&
      !fetchingMore &&
      messagesContainerRef.current.scrollTop === 0 &&
      messages.length === limit
    ) {
      setFetchingMore(true);
      loadMore();
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
  const isDark = useDarkMode();
  return (
    <div
      style={{
        ...chatContainerStyle(isDark),
        position: "relative",
        borderRadius: 16,
        fontFamily:
          "'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif",
        ...(isMobile
          ? {
            width: "100vw",
            height: "100vh",
            maxWidth: "100vw",
            maxHeight: "100vh",
          }
          : {
            height: 700,
            width: 400,
          }),
      }}
    >
      <div style={titleStyle(isDark)}>{title}</div>
      {onClose && <CloseButton onClose={onClose} />}
      <div
        ref={messagesContainerRef}
        style={messageContainerStyle(isDark)}
      >
        {messages.length === 0
          ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                textAlign: "center",
                color: "#888",
              }}
            >
              No messages yet. Start the conversation!
            </div>
          )
          : (
            <>
              {messages.map((msg, i) => (
                <Message
                  key={i}
                  isOwn={msg.authorId === userId}
                  msg={msg}
                  next={messages[i + 1]}
                />
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          marginTop: 8,
          gap: 8,
        }}
      >
        <textarea
          dir="auto"
          ref={inputRef}
          value={input}
          rows={1}
          placeholder="Type a message..."
          onChange={(e) => {
            setInput(e.currentTarget.value);
            const textarea = e.currentTarget;
            textarea.style.height = "auto";
            const singleLine = textarea.value.split("\n").length === 1;
            if (singleLine) {
              textarea.style.height = textarea.scrollHeight + "px";
              if (textarea.scrollHeight > textarea.clientHeight) {
                textarea.style.height = textarea.scrollHeight + "px";
              } else {
                textarea.style.height = "1.5em";
              }
            } else {
              textarea.style.height = textarea.scrollHeight + "px";
            }
          }}
          style={{
            flexGrow: 1,
            padding: "12px 16px",
            border: `2px solid ${isDark ? "#2563eb" : "#3182ce"}`,
            borderRadius: 32,
            background: isDark ? "#181c23" : "#f1f5f9",
            color: isDark ? "#f3f4f6" : "#1e293b",
            fontSize: 16,
            outline: "none",
            resize: "none",
            minHeight: "1.5em",
            maxHeight: 200,
            lineHeight: 1.5,
            transition: "border 0.2s, background 0.2s, color 0.2s",
            boxShadow: isDark
              ? "0 2px 8px rgba(0,0,0,0.18)"
              : "0 2px 8px rgba(0,0,0,0.08)",
            fontFamily: "inherit",
            letterSpacing: 0.1,
            overflow: "auto",
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey) {
              if (isMobile) return;
              if (input.trim()) {
                onSend(input.trim());
                setInput("");
                setTimeout(() => {
                  if (inputRef.current) inputRef.current.style.height = "auto";
                }, 0);
              }
              e.preventDefault();
            } else if (
              e.key === "Enter" && (e.shiftKey || e.ctrlKey)
            ) {
              const selectionStart = e.currentTarget.selectionStart ??
                input.length;
              const selectionEnd = e.currentTarget.selectionEnd ?? input.length;
              const newValue = input.slice(0, selectionStart) +
                "\n" +
                input.slice(selectionEnd);
              setInput(newValue);
              setTimeout(() => {
                if (e.currentTarget) {
                  e.currentTarget.selectionStart =
                    e.currentTarget.selectionEnd =
                      selectionStart + 1;
                }
              }, 0);
              e.preventDefault();
            }
          }}
        />
        <button
          type="button"
          disabled={!input.trim()}
          onClick={() => {
            if (!input.trim()) return;
            onSend(input.trim());
            setInput("");
          }}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 22px 0 16px",
            height: 44,
            borderRadius: 32,
            border: "none",
            background: input.trim()
              ? (isDark
                ? "linear-gradient(90deg,#2563eb 60%,#60a5fa 100%)"
                : "linear-gradient(90deg,#3182ce 60%,#60a5fa 100%)")
              : (isDark ? "#23272f" : "#cbd5e1"),
            color: input.trim() ? "#fff" : (isDark ? "#aaa" : "#64748b"),
            fontWeight: 700,
            fontSize: 17,
            cursor: input.trim() ? "pointer" : "not-allowed",
            boxShadow: isDark
              ? "0 2px 8px rgba(0,0,0,0.18)"
              : "0 2px 8px rgba(0,0,0,0.08)",
            transition: "background 0.2s, color 0.2s, box-shadow 0.2s",
            opacity: input.trim() ? 1 : 0.7,
            borderTopLeftRadius: 12,
            borderBottomLeftRadius: 12,
            gap: 7,
          }}
          title="Send"
        >
          <span
            style={{
              display: "flex",
              alignItems: "center",
              marginRight: 0,
              color: input.trim() ? "#fff" : "#64748b",
              filter: input.trim() ? "drop-shadow(0 1px 2px #0002)" : "none",
              opacity: input.trim() ? 0.95 : 0.7,
              transition: "color 0.2s, filter 0.2s",
            }}
          >
            <FaPaperPlane size={20} />
          </span>
          <span
            style={{
              fontWeight: 600,
              letterSpacing: 0.3,
              fontSize: 15,
              marginLeft: 2,
            }}
          >
            Send
          </span>
        </button>
      </div>
      {fetchingMore && <div style={loadingStyle}>Loading more...</div>}
    </div>
  );
};
