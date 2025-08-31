import { sortKey } from "gamla";
import { useEffect, useRef, useState } from "preact/hooks";
import { FaPaperPlane } from "react-icons/fa";
import ReactMarkdown from "react-markdown";
import {
  chatContainerStyle,
  isLightColor,
  loadingStyle,
  stringToColor,
} from "./design.tsx";
import { useDarkMode, useIsMobile } from "./hooks.ts";

const useTimeAgo = (timestamp: number) => {
  const [timeAgo, setTimeAgo] = useState("");
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    const updateTimeAgo = () => {
      const now = Date.now();
      const diff = now - timestamp;
      const date = new Date(timestamp);
      const nowDate = new Date(now);

      if (diff < 60000) {
        setTimeAgo("just now");
      } else if (diff < 3600000) {
        const minutes = Math.floor(diff / 60000);
        setTimeAgo(`${minutes} minute${minutes !== 1 ? "s" : ""} ago`);
      } else if (
        date.getDate() === nowDate.getDate() &&
        date.getMonth() === nowDate.getMonth() &&
        date.getFullYear() === nowDate.getFullYear()
      ) {
        const hours = Math.floor(diff / 3600000);
        setTimeAgo(`${hours} hour${hours !== 1 ? "s" : ""} ago`);
      } else {
        // Show date, e.g. "Jul 5" or "Jul 5, 2025" if not this year
        const showYear = date.getFullYear() !== nowDate.getFullYear();
        setTimeAgo(
          date.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            ...(showYear ? { year: "numeric" } : {}),
          }),
        );
      }
    };

    updateTimeAgo();

    // Fast update for the first minute, then slow down
    let timeoutId: number | null = null;
    function setSlowInterval() {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(updateTimeAgo, 60000);
    }
    intervalRef.current = setInterval(updateTimeAgo, 1000);
    timeoutId = setTimeout(setSlowInterval, 60000) as unknown as number;

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [timestamp]);

  return timeAgo;
};

export const ChatAvatar = (
  { image, name, baseColor }: {
    image?: string;
    name: string;
    baseColor: string;
  },
) => {
  const isDark = useDarkMode();
  return (
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
        background: baseColor,
        boxShadow: isDark ? "0 1px 4px #0004" : "0 1px 4px #0001",
        transition: "background 0.2s, box-shadow 0.2s",
      }}
    >
      {image
        ? (
          <img
            src={image}
            alt={name}
            style={{
              objectFit: "cover",
              borderRadius: "50%",
            }}
          />
        )
        : (
          <span
            style={{
              color: isLightColor(baseColor)
                ? (isDark ? "#fff" : "#222")
                : (isDark ? "#fff" : "#fff"),
              fontWeight: 700,
              fontSize: 15,
              letterSpacing: 0.5,
            }}
          >
            {name.slice(0, 2).toUpperCase()}
          </span>
        )}
    </div>
  );
};

// Transform markdown so that a single newline becomes a hard line break (<br />),
// while a double newline (blank line) remains a paragraph break, producing a
// visibly larger gap. This matches typical chat expectations where pressing Enter
// (or Shift+Enter) creates a new line, and an empty line creates a blank spacer.
const convertSingleNewlines = (input: string) =>
  input
    .split(/\n\n+/) // split on one or more blank lines to retain paragraph breaks
    .map((block) => block.replace(/\n/g, "  \n")) // within paragraphs, make single newlines hard breaks
    .join("\n\n"); // rejoin with a single blank line (Markdown collapses multiples anyway)

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
  const baseColor = isOwn
    ? isDark ? "#2563eb" : "#3182ce"
    : stringToColor(authorId, isDark);
  const showAvatar = isFirstOfSequence;
  const textColor = isLightColor(baseColor)
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
        <ChatAvatar
          image={authorAvatar}
          name={authorName}
          baseColor={baseColor}
        />
      )}
      <div
        style={{
          background: baseColor,
          color: textColor,
          alignSelf: isOwn ? "flex-end" : "flex-start",
          borderRadius: 16,
          padding: "6px 12px",
          marginLeft: isOwn ? 0 : !isOwn && showAvatar ? 0 : 36,
          marginRight: isOwn ? (showAvatar ? 0 : 36) : 0,
          maxWidth: "80%",
          overflowWrap: "break-word",
        }}
      >
        <b style={{ fontSize: 11 }}>{authorName}</b>
        <div dir="auto">
          <ReactMarkdown>
            {convertSingleNewlines(text)}
          </ReactMarkdown>
        </div>
        <span
          style={{
            color: isDark ? "#bbb" : (textColor === "#222" ? "#555" : "#eee"),
            fontSize: 10,
            float: "right",
          }}
        >
          {useTimeAgo(timestamp)}
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
        &times;
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
  flexDirection: "column",
  background: isDark ? "#181c23" : "#f8fafc",
  scrollbarColor: isDark ? "#374151 #181c23" : "#cbd5e1 #f8fafc",
  padding: 4,
});

const sendButtonStyle = (isDark: boolean, disabled: boolean) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 22px 0 16px",
  height: 44,
  borderRadius: 32,
  border: "none",
  background: !disabled
    ? (isDark
      ? "linear-gradient(90deg,#2563eb 60%,#60a5fa 100%)"
      : "linear-gradient(90deg,#3182ce 60%,#60a5fa 100%)")
    : (isDark ? "#23272f" : "#cbd5e1"),
  color: !disabled ? "#fff" : (isDark ? "#aaa" : "#64748b"),
  fontWeight: 700,
  fontSize: 17,
  cursor: !disabled ? "pointer" : "not-allowed",
  boxShadow: isDark
    ? "0 2px 8px rgba(0,0,0,0.18)"
    : "0 2px 8px rgba(0,0,0,0.08)",
  transition: "background 0.2s, color 0.2s, box-shadow 0.2s",
  opacity: !disabled ? 1 : 0.7,
  borderTopLeftRadius: 12,
  borderBottomLeftRadius: 12,
  gap: 7,
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
  // Track viewport height for mobile keyboard handling
  const [viewportHeight, setViewportHeight] = useState(
    typeof globalThis !== "undefined" && "innerHeight" in globalThis
      ? globalThis.innerHeight
      : 0,
  );
  useEffect(() => {
    if (!isMobile) return;
    const handleResize = () => {
      setViewportHeight(globalThis.innerHeight);
    };
    globalThis.addEventListener("resize", handleResize);
    return () => {
      globalThis.removeEventListener("resize", handleResize);
    };
  }, [isMobile]);
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
    if (!onClose) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    globalThis.addEventListener("keydown", handleKeyDown);
    return () => {
      globalThis.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);
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

  // Scroll to bottom when messages change (new message sent/received)
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight;
    }
  }, [messages.length]);

  // Helper to resize textarea
  const resizeTextarea = (textarea: HTMLTextAreaElement) => {
    textarea.style.height = "auto";
    const singleLine = textarea.value.indexOf("\n") === -1;
    if (singleLine) {
      textarea.style.height = textarea.scrollHeight + "px";
      if (textarea.scrollHeight > textarea.clientHeight) {
        textarea.style.height = textarea.scrollHeight + "px";
      } else {
        textarea.style.height = "1.5em";
      }
      textarea.style.overflowY = "hidden"; // Hide vertical scrollbar for single line
    } else {
      textarea.style.height = textarea.scrollHeight + "px";
      textarea.style.overflowY = "auto"; // Allow vertical scroll for multiline
    }
  };

  return (
    <div
      style={{
        ...chatContainerStyle(isDark),
        position: "relative",
        borderRadius: isMobile ? 0 : 16,
        fontFamily:
          "'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif",
        height: isMobile ? viewportHeight : "auto",
        display: "flex",
        flexDirection: "column",
        ...(isMobile ? { flexGrow: 1 } : { height: 700, width: 400 }),
      }}
    >
      <div style={titleStyle(isDark)}>{title}</div>
      {onClose && <CloseButton onClose={onClose} />}
      <div
        ref={messagesContainerRef}
        style={{
          ...messageContainerStyle(isDark),
          flex: 1,
          overflowY: "auto",
        }}
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
              {sortKey((x: AbstracChatMessage) => x.timestamp)(messages).map((
                msg,
                i,
                arr,
              ) => (
                <Message
                  key={i}
                  isOwn={msg.authorId === userId}
                  msg={msg}
                  next={arr[i + 1]}
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
          gap: 8,
        }}
      >
        <textarea
          dir="auto"
          ref={inputRef}
          value={input}
          rows={1}
          placeholder="Type a message..."
          onInput={(e) => {
            setInput(e.currentTarget.value);
            resizeTextarea(e.currentTarget);
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
            overflowY: "auto",
            overflowX: "hidden",
            maxHeight: 200,
            lineHeight: 1.5,
            transition: "border 0.2s, background 0.2s, color 0.2s",
            boxShadow: isDark
              ? "0 2px 8px rgba(0,0,0,0.18)"
              : "0 2px 8px rgba(0,0,0,0.08)",
            fontFamily: "inherit",
            letterSpacing: 0.1,
            scrollbarColor: isDark ? "#374151 #181c23" : "#cbd5e1 #f1f5f9",
            scrollbarWidth: "thin",
          }}
          onKeyDown={(e) => {
            // Allow PageUp/PageDown to scroll the textarea if possible
            if (
              (e.key === "PageUp" || e.key === "PageDown") && e.currentTarget
            ) {
              const ta = e.currentTarget;
              const canScrollUp = ta.scrollTop > 0;
              const canScrollDown =
                ta.scrollTop + ta.clientHeight < ta.scrollHeight;
              if (
                (e.key === "PageUp" && canScrollUp) ||
                (e.key === "PageDown" && canScrollDown)
              ) {
                e.stopPropagation();
                // Let the textarea handle the scroll
                return;
              }
            }
            if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey) {
              if (isMobile) return;
              if (input.trim()) {
                onSend(input.trim());
                setInput("");
                setTimeout(() => {
                  if (inputRef.current) {
                    inputRef.current.style.height = "auto";
                    inputRef.current.focus();
                  }
                }, 0);
              }
              e.preventDefault();
            } else if (
              e.key === "Enter" && (e.shiftKey || e.ctrlKey)
            ) {
              const selectionStart = e.currentTarget.selectionStart ??
                input.length;
              const selectionEnd = e.currentTarget.selectionEnd ?? input.length;
              const newValue = input.slice(0, selectionStart) + "\n" +
                input.slice(selectionEnd);
              // Update the DOM value directly so resizeTextarea sees the new value immediately
              e.currentTarget.value = newValue;
              resizeTextarea(e.currentTarget);
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
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (!input.trim()) return;
            onSend(input.trim());
            setInput("");
            setTimeout(() => {
              if (inputRef.current) {
                inputRef.current.focus();
                inputRef.current.style.height = "auto";
              }
            }, 0);
          }}
          style={sendButtonStyle(isDark, !input.trim())}
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
          <span>Send</span>
        </button>
      </div>
      {fetchingMore && <div style={loadingStyle}>Loading more...</div>}
    </div>
  );
};
