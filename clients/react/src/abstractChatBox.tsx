import { empty, sortKey } from "@uri/gamla";
import { useEffect, useRef, useState } from "preact/hooks";
import {
  FaDownload,
  FaEllipsisV,
  FaHistory,
  FaMicrophone,
  FaPaperclip,
  FaPaperPlane,
  FaPause,
  FaPen,
  FaPlay,
  FaStop,
} from "react-icons/fa";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ComponentChildren, JSX } from "preact";
import type { Attachment } from "../../../protocol/src/clientApi.ts";
import {
  centerFillStyle,
  chatContainerStyle,
  type CustomColors,
  isLightColor,
  loadingStyle,
  Spinner,
  stringToColor,
} from "./design.tsx";
import { useDarkMode, useIsMobile } from "./hooks.ts";

const typingIndicatorStyle = (isDark: boolean) => ({
  padding: "0 8px 6px 44px",
  color: isDark ? "#cbd5e1" : "#475569",
  fontSize: 12,
});

const SendingAudioIndicator = ({ isDark }: { isDark: boolean }) => {
  const baseColor = isDark ? "#2563eb" : "#3182ce";
  return (
    <div style={{ display: "flex", flexDirection: "row-reverse", gap: 6 }}>
      <div
        style={{
          background: baseColor,
          borderRadius: 16,
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          opacity: 0.7,
        }}
      >
        <Spinner />
        <span style={{ color: "#fff", fontSize: 13 }}>Sending audio...</span>
      </div>
    </div>
  );
};

const paragraphSpacingStyle: JSX.CSSProperties = { margin: "0 0 8px 0" };

const MarkdownParagraph = ({ children }: { children?: ComponentChildren }) => (
  <div style={paragraphSpacingStyle}>{children}</div>
);

const TypingIndicator = (
  { names, isDark }: { names: string[]; isDark: boolean },
) => {
  const [dots, setDots] = useState(0);
  useEffect(() => {
    const t = setInterval(
      () => setDots((n) => (n + 1) % 4),
      400,
    );
    return () => clearInterval(t);
  }, []);
  const label = names.length === 1
    ? `${names[0]} is typing`
    : `${names.slice(0, 2).join(", ")}${
      names.length > 2 ? " and others" : ""
    } are typing`;
  return (
    <div style={typingIndicatorStyle(isDark)}>
      {label}
      <span style={{ display: "inline-block", width: 18, letterSpacing: 2 }}>
        {".".repeat(dots)}
      </span>
    </div>
  );
};

// Treat raw HTML in markdown as text so it renders literally (e.g., <script>...)
type MdNode = { type?: string; value?: string; children?: MdNode[] };
const remarkHtmlToText = () => (tree: MdNode) => {
  const visit = (node?: MdNode) => {
    if (!node) return;
    if (Array.isArray(node.children)) {
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child && child.type === "html" && typeof child.value === "string") {
          node.children[i] = { type: "text", value: child.value };
        } else {
          visit(child);
        }
      }
    }
  };
  visit(tree);
};

const bubbleImgStyle: JSX.CSSProperties = {
  display: "block",
  maxWidth: "100%",
  height: "auto",
  borderRadius: 8,
  marginTop: 6,
};

const bubbleVideoStyle: JSX.CSSProperties = {
  display: "block",
  maxWidth: "100%",
  height: "auto",
  borderRadius: 8,
  marginTop: 6,
  background: "#000",
};

const bubbleAudioStyle: JSX.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 6,
};

const htmlImgToMarkdown = (text: string) => {
  const rx = /<img\s+[^>]*>/gi;
  return text.replace(rx, (tag) => {
    const src = /\ssrc=["']([^"']+)["']/i.exec(tag)?.[1] ?? "";
    if (!/^https?:\/\//i.test(src)) return tag;
    const alt = /\salt=["']([^"']*)["']/i.exec(tag)?.[1] ?? "";
    return `![${alt}](${src})`;
  });
};

const isVideoUrl = (href?: string) =>
  !!href && /\.(mp4|webm|ogg|m4v|mov)(\?.*)?$/i.test(href);
const isAudioUrl = (href?: string) =>
  !!href && /\.(mp3|wav|ogg|m4a|flac)(\?.*)?$/i.test(href);

const htmlMediaToLinks = (text: string) => {
  let out = text;
  // <video src="...">
  out = out.replace(/<video\s+[^>]*>/gi, (tag) => {
    const src = /\ssrc=["']([^"']+)["']/i.exec(tag)?.[1] ?? "";
    if (!/^https?:\/\//i.test(src)) return tag;
    return src;
  });
  // <audio src="...">
  out = out.replace(/<audio\s+[^>]*>/gi, (tag) => {
    const src = /\ssrc=["']([^"']+)["']/i.exec(tag)?.[1] ?? "";
    if (!/^https?:\/\//i.test(src)) return tag;
    return src;
  });
  // <source src="..."> (inside media)
  out = out.replace(/<source\s+[^>]*>/gi, (tag) => {
    const src = /\ssrc=["']([^"']+)["']/i.exec(tag)?.[1] ?? "";
    if (!/^https?:\/\//i.test(src)) return tag;
    return src;
  });
  return out;
};

const preprocessText = (text: string) =>
  htmlImgToMarkdown(htmlMediaToLinks(text));

const copyOverlayStyle = (
  { isDark }: { isDark: boolean },
) => ({
  position: "absolute",
  top: 6,
  right: 8,
  fontSize: 11,
  lineHeight: 1,
  borderRadius: 10,
  border: isDark ? "1px solid #374151" : "1px solid #00000020",
  padding: "4px 8px",
  background: isDark ? "#111827cc" : "#111827cc",
  color: isDark ? "#f9fafb" : "#fff",
  cursor: "pointer",
  boxShadow: isDark ? "0 2px 6px #0006" : "0 1px 3px #0002",
  opacity: 0.95,
  zIndex: 2,
});

const codeLabelStyle = ({ isDark }: { isDark: boolean }) => ({
  position: "absolute",
  top: 6,
  left: 8,
  fontSize: 10,
  lineHeight: 1,
  borderRadius: 8,
  padding: "3px 6px",
  background: isDark ? "#ffffff1a" : "#0000000f",
  color: isDark ? "#e5e7eb" : "#111827",
  fontWeight: 600,
});

const copyToClipboard = async (text: string) => {
  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) {
    // ignore and try fallback
  }
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch (_) {
    return false;
  }
};

const useTimeAgo = (timestamp: number) => {
  const [timeAgo, setTimeAgo] = useState("");
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    const date = new Date(timestamp);
    const update = () => {
      const now = new Date();
      const diff = now.getTime() - timestamp;
      if (diff < 60000) {
        setTimeAgo("just now");
      } else if (diff < 3600000) {
        const minutes = Math.floor(diff / 60000);
        setTimeAgo(`${minutes} minute${minutes !== 1 ? "s" : ""} ago`);
      } else if (date.toDateString() === now.toDateString()) {
        const hours = Math.floor(diff / 3600000);
        setTimeAgo(`${hours} hour${hours !== 1 ? "s" : ""} ago`);
      } else {
        const showYear = date.getFullYear() !== now.getFullYear();
        setTimeAgo(
          date.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            ...(showYear ? { year: "numeric" } : {}),
          }),
        );
      }
    };

    update();

    let timeoutId: number | null = null;
    const setSlowInterval = () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      const slowHandle = setInterval(update, 60000);
      intervalRef.current = typeof slowHandle === "number" ? slowHandle : null;
    };
    const fastHandle = setInterval(update, 1000);
    intervalRef.current = typeof fastHandle === "number" ? fastHandle : null;
    const to = setTimeout(setSlowInterval, 60000);
    timeoutId = typeof to === "number" ? to : null;

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [timestamp]);

  return timeAgo;
};

const CodeBlock = (
  { inline, className, children }: {
    inline?: boolean;
    className?: string;
    children?: ComponentChildren;
  },
) => {
  const isDark = useDarkMode();
  if (inline) {
    return (
      <code
        class={className}
        style={{
          background: isDark ? "#ffffff22" : "#00000012",
          padding: "0 4px",
          borderRadius: 4,
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
          fontSize: 13,
        }}
      >
        {children}
      </code>
    );
  }
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const codeStr = String(children ?? "").replace(/\n$/, "");
  const lang = (className?.match(/language-([A-Za-z0-9_+-]+)/)?.[1] || "")
    .toUpperCase();
  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        onClick={async () => {
          const ok = await copyToClipboard(codeStr);
          if (ok) {
            setCopied(true);
            setTimeout(() => setCopied(false), 1000);
          }
        }}
        title={copied ? "Copied" : "Copy"}
        style={{
          ...copyOverlayStyle({ isDark }),
          opacity: hovered || copied ? 0.95 : 0,
          pointerEvents: hovered || copied ? "auto" : "none",
          transition: "opacity 0.15s ease-in-out",
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
      <pre
        style={{
          position: "relative",
          padding: "10px 12px",
          overflow: "auto",
          background: isDark ? "#0b1220" : "#f3f4f6",
          color: isDark ? "#e5e7eb" : "#111827",
          borderRadius: 8,
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
          fontSize: 13,
        }}
      >
        <div
          style={{
            position: "relative",
            display: "inline-block",
            minWidth: "max-content",
          }}
        >
          {lang && <span style={codeLabelStyle({ isDark })}>{lang}</span>}
          <code className={className}>{codeStr}</code>
        </div>
      </pre>
    </div>
  );
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

const formatDuration = (seconds: number) => {
  if (!isFinite(seconds) || isNaN(seconds)) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const attachmentContainerStyle: JSX.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  marginTop: 6,
};

const audioPlayerStyle = (isDark: boolean): JSX.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 14px",
  borderRadius: 20,
  background: isDark ? "#ffffff15" : "#00000008",
  minWidth: 200,
});

const AudioPlayer = (
  { src, isDark, fallbackDuration }: {
    src: string;
    isDark: boolean;
    fallbackDuration?: number;
  },
): JSX.Element => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => {
      const dur = audio.duration;
      if (isFinite(dur) && !isNaN(dur)) {
        setDuration(dur);
      } else if (fallbackDuration) {
        setDuration(fallbackDuration);
      }
    };
    const onEnded = () => setIsPlaying(false);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e: JSX.TargetedMouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    audio.currentTime = percent * duration;
  };

  const progress = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div style={audioPlayerStyle(isDark)}>
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        type="button"
        onClick={togglePlay}
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          border: "none",
          background: isDark ? "#3b82f6" : "#2563eb",
          color: "#fff",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {isPlaying
          ? <FaPause size={14} />
          : <FaPlay size={14} style={{ marginLeft: 2 }} />}
      </button>
      <div
        style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}
      >
        <div
          onClick={handleSeek}
          style={{
            height: 24,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 2,
          }}
        >
          {Array.from({ length: 30 }).map((_, i) => {
            const barProgress = (i / 30) * 100;
            const isPlayed = barProgress < progress;
            const height = 6 + Math.sin(i * 0.8) * 6 + Math.random() * 4;
            return (
              <div
                key={i}
                style={{
                  width: 3,
                  height,
                  borderRadius: 2,
                  background: isPlayed
                    ? (isDark ? "#3b82f6" : "#2563eb")
                    : (isDark ? "#ffffff40" : "#00000020"),
                  transition: "background 0.1s",
                }}
              />
            );
          })}
        </div>
        <div
          style={{
            fontSize: 11,
            color: isDark ? "#9ca3af" : "#64748b",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>{formatDuration(Math.floor(currentTime))}</span>
          <span>
            {(duration || fallbackDuration)
              ? formatDuration(Math.floor(duration || fallbackDuration || 0))
              : "--:--"}
          </span>
        </div>
      </div>
    </div>
  );
};

const fileAttachmentStyle = (isDark: boolean): JSX.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 12px",
  borderRadius: 8,
  background: isDark ? "#ffffff15" : "#00000010",
  textDecoration: "none",
  color: "inherit",
});

const AttachmentRenderer = (
  {
    attachment,
    textColor,
    isDark,
    onDecrypt,
    isOwn,
    messageTimestamp,
    sessionStart,
  }: {
    attachment: Attachment;
    textColor: string;
    isDark: boolean;
    onDecrypt?: (url: string) => Promise<string>;
    isOwn?: boolean;
    messageTimestamp?: number;
    sessionStart?: number;
  },
) => {
  const [decryptedUrl, setDecryptedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleDecrypt = async () => {
    if (!onDecrypt || decryptedUrl) return;
    setLoading(true);
    const url = await onDecrypt(attachment.url);
    setDecryptedUrl(url);
    setLoading(false);
  };

  const isFromThisSession = messageTimestamp && sessionStart &&
    messageTimestamp >= sessionStart;

  useEffect(() => {
    if (
      isOwn && isFromThisSession && attachment.type === "audio" && onDecrypt &&
      !decryptedUrl
    ) {
      handleDecrypt();
    }
  }, [isOwn, isFromThisSession, attachment.type, onDecrypt]);

  if (attachment.type === "audio") {
    return decryptedUrl
      ? (
        <AudioPlayer
          src={decryptedUrl}
          isDark={isDark}
          fallbackDuration={attachment.duration}
        />
      )
      : (
        <div style={audioPlayerStyle(isDark)}>
          <button
            type="button"
            onClick={handleDecrypt}
            disabled={loading}
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              border: "none",
              background: isDark ? "#3b82f6" : "#2563eb",
              color: "#fff",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {loading ? <Spinner /> : <FaDownload size={14} />}
          </button>
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <div
              style={{
                height: 24,
                display: "flex",
                alignItems: "center",
                gap: 2,
              }}
            >
              {Array.from({ length: 30 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: 3,
                    height: 6 + Math.sin(i * 0.8) * 6,
                    borderRadius: 2,
                    background: isDark ? "#ffffff40" : "#00000020",
                  }}
                />
              ))}
            </div>
            {attachment.duration !== undefined && (
              <div
                style={{
                  fontSize: 11,
                  color: isDark ? "#9ca3af" : "#64748b",
                }}
              >
                {formatDuration(attachment.duration)}
              </div>
            )}
          </div>
        </div>
      );
  }

  if (attachment.type === "image") {
    return decryptedUrl
      ? (
        <img
          src={decryptedUrl}
          alt={attachment.name}
          style={{
            maxWidth: "100%",
            borderRadius: 8,
            cursor: "pointer",
          }}
        />
      )
      : (
        <button
          type="button"
          onClick={handleDecrypt}
          disabled={loading}
          style={{
            ...fileAttachmentStyle(isDark),
            cursor: "pointer",
            border: "none",
          }}
        >
          <span>🖼️</span>
          <span style={{ color: textColor, fontSize: 13 }}>
            {loading ? "Loading..." : attachment.name}
          </span>
        </button>
      );
  }

  if (attachment.type === "video") {
    return decryptedUrl
      ? (
        <video
          controls
          preload="metadata"
          style={{ maxWidth: "100%", borderRadius: 8 }}
        >
          <source src={decryptedUrl} type={attachment.mimeType} />
        </video>
      )
      : (
        <button
          type="button"
          onClick={handleDecrypt}
          disabled={loading}
          style={{
            ...fileAttachmentStyle(isDark),
            cursor: "pointer",
            border: "none",
          }}
        >
          <span>🎬</span>
          <span style={{ color: textColor, fontSize: 13 }}>
            {loading ? "Loading..." : attachment.name}
          </span>
        </button>
      );
  }

  return (
    <a
      href={decryptedUrl ?? "#"}
      onClick={async (e) => {
        if (!decryptedUrl && onDecrypt) {
          e.preventDefault();
          await handleDecrypt();
        }
      }}
      download={attachment.name}
      style={fileAttachmentStyle(isDark)}
    >
      <span>📎</span>
      <div style={{ flex: 1 }}>
        <div style={{ color: textColor, fontSize: 13 }}>{attachment.name}</div>
        <div style={{ color: textColor, fontSize: 11, opacity: 0.7 }}>
          {formatFileSize(attachment.size)}
        </div>
      </div>
    </a>
  );
};

type MessageProps = {
  msg: AbstracChatMessage;
  prev: AbstracChatMessage | undefined;
  isOwn: boolean;
  onDecryptAttachment?: (url: string) => Promise<string>;
  sessionStart: number;
  onEdit?: (newText: string) => void;
  customColors?: CustomColors;
};

const messageFooterStyle: JSX.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  alignItems: "center",
  gap: 4,
};

const editTextareaStyle: JSX.CSSProperties = {
  width: "100%",
  padding: 6,
  borderRadius: 8,
  border: "none",
  fontSize: 14,
  resize: "vertical",
  minHeight: 40,
};

const editActionsStyle: JSX.CSSProperties = {
  display: "flex",
  gap: 4,
  marginTop: 4,
};

const saveButtonStyle = (isDark: boolean): JSX.CSSProperties => ({
  padding: "4px 8px",
  borderRadius: 6,
  border: "none",
  background: isDark ? "#374151" : "#e5e7eb",
  cursor: "pointer",
  fontSize: 12,
});

const cancelButtonStyle: JSX.CSSProperties = {
  padding: "4px 8px",
  borderRadius: 6,
  border: "none",
  background: "transparent",
  cursor: "pointer",
  fontSize: 12,
  opacity: 0.7,
};

const submitEdit = (
  onEdit: (text: string) => void,
  text: string,
  originalText: string,
) =>
(setIsEditing: (v: boolean) => void) => {
  if (text.trim() && text !== originalText) onEdit(text);
  setIsEditing(false);
};

const kebabHoverCss =
  `.msg-bubble .msg-kebab{opacity:0;transition:opacity .15s}.msg-bubble:hover .msg-kebab,.msg-kebab[data-open]{opacity:.7}`;

const KebabHoverStyle = () => <style>{kebabHoverCss}</style>;

const kebabMenuStyle = (textColor: string): JSX.CSSProperties => ({
  background: "transparent",
  border: "none",
  cursor: "pointer",
  padding: "2px 4px",
  color: textColor,
  borderRadius: 4,
  display: "flex",
  alignItems: "center",
});

const dropdownMenuStyle = (
  isDark: boolean,
  rect: DOMRect,
): JSX.CSSProperties => ({
  position: "fixed",
  top: rect.bottom + 2,
  right: globalThis.innerWidth - rect.right,
  background: isDark ? "#1f2937" : "#fff",
  borderRadius: 8,
  boxShadow: isDark ? "0 4px 12px #0008" : "0 4px 12px #0003",
  zIndex: 10000,
  minWidth: 120,
  overflow: "hidden",
});

const dropdownItemStyle = (isDark: boolean): JSX.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: "8px 12px",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  fontSize: 13,
  color: isDark ? "#e5e7eb" : "#1f2937",
  whiteSpace: "nowrap",
});

const MessageEditControls = ({
  hasEdits,
  canEdit,
  isEditing,
  textColor,
  onShowHistory,
  onStartEdit,
}: {
  hasEdits: boolean;
  canEdit: boolean;
  isEditing: boolean;
  textColor: string;
  onShowHistory: () => void;
  onStartEdit: () => void;
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const isDark = useDarkMode();
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const showMenu = canEdit || hasEdits;

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  if (!showMenu || isEditing) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <button
          type="button"
          style={{ ...kebabMenuStyle(textColor), visibility: "hidden" }}
        >
          <FaEllipsisV size={12} />
        </button>
      </div>
    );
  }

  const btnRect = btnRef.current?.getBoundingClientRect();

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {hasEdits && <span style={{ fontSize: 10, opacity: 0.7 }}>edited</span>}
      <button
        ref={btnRef}
        type="button"
        className="msg-kebab"
        data-open={menuOpen || undefined}
        onClick={() => setMenuOpen((v) => !v)}
        style={kebabMenuStyle(textColor)}
        title="More options"
      >
        <FaEllipsisV size={12} />
      </button>
      {menuOpen && btnRect && (
        <div ref={menuRef} style={dropdownMenuStyle(isDark, btnRect)}>
          {canEdit && (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onStartEdit();
              }}
              style={dropdownItemStyle(isDark)}
              onMouseEnter={(e) => (e.currentTarget.style.background = isDark
                ? "#374151"
                : "#f3f4f6")}
              onMouseLeave={(
                e,
              ) => (e.currentTarget.style.background = "transparent")}
            >
              <FaPen size={11} />
              Edit
            </button>
          )}
          {hasEdits && (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onShowHistory();
              }}
              style={dropdownItemStyle(isDark)}
              onMouseEnter={(e) => (e.currentTarget.style.background = isDark
                ? "#374151"
                : "#f3f4f6")}
              onMouseLeave={(
                e,
              ) => (e.currentTarget.style.background = "transparent")}
            >
              <FaHistory size={11} />
              View history
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const EditForm = ({
  editText,
  setEditText,
  onSubmit,
  onCancel,
  isDark,
}: {
  editText: string;
  setEditText: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isDark: boolean;
}) => (
  <div style={{ marginTop: 4 }}>
    <textarea
      value={editText}
      onInput={(e) => setEditText(e.currentTarget.value)}
      style={editTextareaStyle}
    />
    <div style={editActionsStyle}>
      <button type="button" onClick={onSubmit} style={saveButtonStyle(isDark)}>
        Save
      </button>
      <button type="button" onClick={onCancel} style={cancelButtonStyle}>
        Cancel
      </button>
    </div>
  </div>
);

const Message = (
  {
    msg: {
      authorId,
      authorName,
      authorAvatar,
      text,
      timestamp,
      attachments,
      editHistory,
    },
    prev,
    isOwn,
    onDecryptAttachment,
    sessionStart,
    onEdit,
    customColors,
  }: MessageProps,
) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(text);
  const [showHistory, setShowHistory] = useState(false);
  const isStartOfSequence = !prev || prev.authorId !== authorId;
  const isDark = useDarkMode();
  const baseColor = isOwn
    ? (customColors?.primary ?? (isDark ? "#2563eb" : "#3182ce"))
    : stringToColor(authorId, isDark);
  const noBubble = !isOwn && customColors?.hideOtherBubble;
  const showAvatar = isStartOfSequence &&
    !(isOwn && customColors?.hideOwnAvatar);
  const textColor = noBubble
    ? (customColors?.text ?? (isDark ? "#f4f4f4" : "#222"))
    : isLightColor(baseColor)
    ? (isDark ? "#fff" : "#222")
    : (isDark ? "#fff" : "#fff");
  const avatarSpace = isOwn ? (customColors?.hideOwnAvatar ? 0 : 36) : 36;
  const canEdit = !!(isOwn && onEdit && Date.now() - timestamp < editWindowMs);
  const hasEdits = !empty(editHistory ?? []);

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
        className="msg-bubble"
        style={{
          background: noBubble ? "transparent" : baseColor,
          color: textColor,
          alignSelf: isOwn ? "flex-end" : "flex-start",
          borderRadius: noBubble ? 0 : 16,
          padding: noBubble ? "2px 0" : "6px 12px",
          marginLeft: isOwn ? 0 : showAvatar ? 0 : avatarSpace,
          marginRight: isOwn ? (showAvatar ? 0 : avatarSpace) : 0,
          maxWidth: "80%",
          overflowX: "hidden",
          overflowY: "hidden",
          wordBreak: "break-word",
          overflowWrap: "anywhere",
        }}
      >
        {isStartOfSequence && !customColors?.hideNames &&
          <b style={{ fontSize: 11 }}>{authorName}</b>}
        {isEditing
          ? (
            <EditForm
              editText={editText}
              setEditText={setEditText}
              onSubmit={() =>
                onEdit && submitEdit(onEdit, editText, text)(setIsEditing)}
              onCancel={() => {
                setIsEditing(false);
                setEditText(text);
              }}
              isDark={isDark}
            />
          )
          : text && (
            <div
              dir="auto"
              style={{
                overflowWrap: "anywhere",
                wordBreak: "break-word",
              }}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkHtmlToText]}
                components={{
                  // @ts-ignore-error react-markdown types are not fully compatible with Preact here. `ignore` because works locally.
                  p: MarkdownParagraph,
                  // @ts-expect-error react-markdown types are not fully compatible with Preact here
                  a: ({ children, href }) => {
                    if (isVideoUrl(href)) {
                      return (
                        <video
                          src={href}
                          controls
                          preload="metadata"
                          playsInline
                          style={bubbleVideoStyle}
                        />
                      );
                    }
                    if (isAudioUrl(href)) {
                      return (
                        <audio
                          src={href}
                          controls
                          preload="metadata"
                          style={bubbleAudioStyle}
                        />
                      );
                    }
                    return (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: textColor,
                          textDecoration: "underline",
                          overflowWrap: "anywhere",
                          wordBreak: "break-word",
                        }}
                      >
                        {children}
                      </a>
                    );
                  },
                  // @ts-expect-error react-markdown types are not fully compatible with Preact here
                  img: ({ src, alt }) => (
                    <img src={src} alt={alt} style={bubbleImgStyle} />
                  ),
                  // @ts-ignore-error react-markdown types are not fully compatible with Preact here. `ignore` because works locally.
                  code: CodeBlock,
                }}
              >
                {preprocessText(text)}
              </ReactMarkdown>
            </div>
          )}
        {attachments && attachments.length > 0 && (
          <div style={attachmentContainerStyle}>
            {attachments.map((att, i) => (
              <AttachmentRenderer
                key={i}
                attachment={att}
                textColor={textColor}
                isDark={isDark}
                onDecrypt={onDecryptAttachment}
                isOwn={isOwn}
                messageTimestamp={timestamp}
                sessionStart={sessionStart}
              />
            ))}
          </div>
        )}
        <div style={messageFooterStyle}>
          <MessageEditControls
            hasEdits={hasEdits}
            canEdit={canEdit}
            isEditing={isEditing}
            textColor={textColor}
            onShowHistory={() => setShowHistory(true)}
            onStartEdit={() => setIsEditing(true)}
          />
          <span
            style={{
              color: isDark ? "#bbb" : (textColor === "#222" ? "#555" : "#eee"),
              fontSize: 10,
            }}
          >
            {useTimeAgo(timestamp)}
          </span>
        </div>
      </div>
      {showHistory && editHistory && (
        <EditHistoryPopup
          edits={editHistory}
          currentText={text}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
};

export type EditHistoryEntry = {
  text: string;
  timestamp: number;
  attachments?: Attachment[];
};

export type AbstracChatMessage = {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  text: string;
  timestamp: number;
  attachments?: Attachment[];
  editHistory?: EditHistoryEntry[];
};

export type ActiveSpinner = {
  authorName: string;
  text: string;
  elementId: string;
  timestamp: number;
};

export type ActiveProgress = {
  authorName: string;
  text: string;
  percentage: number;
  elementId: string;
  timestamp: number;
};

type TimelineEntry =
  | { kind: "message"; msg: AbstracChatMessage; prevMsg?: AbstracChatMessage }
  | { kind: "spinner"; spinner: ActiveSpinner }
  | { kind: "progress"; progress: ActiveProgress };

const buildTimeline = (
  messages: AbstracChatMessage[],
  spinners: ActiveSpinner[],
  progress: ActiveProgress[],
): TimelineEntry[] => {
  const sorted = sortKey((x: AbstracChatMessage) => x.timestamp)(messages);
  const msgEntries: TimelineEntry[] = sorted.map((msg, i) => ({
    kind: "message",
    msg,
    prevMsg: sorted[i - 1],
  }));
  const spinnerEntries: TimelineEntry[] = spinners.map((s) => ({
    kind: "spinner",
    spinner: s,
  }));
  const progressEntries: TimelineEntry[] = progress.map((p) => ({
    kind: "progress",
    progress: p,
  }));
  const tsOf = (e: TimelineEntry): number =>
    e.kind === "message"
      ? e.msg.timestamp
      : e.kind === "spinner"
      ? e.spinner.timestamp
      : e.progress.timestamp;
  return sortKey(tsOf)([...msgEntries, ...spinnerEntries, ...progressEntries]);
};

const editWindowMs = 5 * 60 * 1000;

const formatEditTime = (ts: number) => {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const overlayStyle: JSX.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: "rgba(0,0,0,0.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const historyPopupStyle = (isDark: boolean): JSX.CSSProperties => ({
  background: isDark ? "#23272f" : "#fff",
  borderRadius: 12,
  padding: 16,
  maxWidth: 400,
  maxHeight: "80vh",
  overflow: "auto",
  border: `1px solid ${isDark ? "#374151" : "#e5e7eb"}`,
  color: isDark ? "#eee" : "#222",
});

const historyEntryStyle = (isDark: boolean): JSX.CSSProperties => ({
  marginBottom: 8,
  padding: 8,
  background: isDark ? "#1f2937" : "#f9fafb",
  borderRadius: 8,
  opacity: 0.8,
});

const historyCurrentStyle = (isDark: boolean): JSX.CSSProperties => ({
  marginBottom: 12,
  padding: 8,
  background: isDark ? "#374151" : "#f3f4f6",
  borderRadius: 8,
});

const historyCloseButtonStyle = (isDark: boolean): JSX.CSSProperties => ({
  marginTop: 8,
  padding: "6px 12px",
  background: isDark ? "#374151" : "#e5e7eb",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  color: isDark ? "#eee" : "#222",
});

const labelStyle: JSX.CSSProperties = { fontSize: 10, opacity: 0.7 };

const EditHistoryPopup = ({
  edits,
  currentText,
  onClose,
}: {
  edits: EditHistoryEntry[];
  currentText: string;
  onClose: () => void;
}) => {
  const isDark = useDarkMode();
  return (
    <div style={overlayStyle} onClick={onClose}>
      <div
        style={historyPopupStyle(isDark)}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontWeight: "bold", marginBottom: 12 }}>Edit History</div>
        <div style={historyCurrentStyle(isDark)}>
          <div style={labelStyle}>Current</div>
          <div>{currentText}</div>
        </div>
        {edits.map((edit, i) => (
          <div key={i} style={historyEntryStyle(isDark)}>
            <div style={labelStyle}>{formatEditTime(edit.timestamp)}</div>
            <div>{edit.text}</div>
          </div>
        ))}
        <button
          type="button"
          onClick={onClose}
          style={historyCloseButtonStyle(isDark)}
        >
          Close
        </button>
      </div>
    </div>
  );
};

const indicatorTextStyle = (isDark: boolean): JSX.CSSProperties => ({
  padding: "6px 12px 6px 44px",
  color: isDark ? "#cbd5e1" : "#475569",
  fontSize: 14,
});

const linearBarTrackStyle = (isDark: boolean): JSX.CSSProperties => ({
  width: 200,
  height: 4,
  border: `1px solid ${isDark ? "#cbd5e1" : "#475569"}`,
  borderRadius: 4,
  marginTop: 4,
  overflow: "hidden",
});

const linearBarFillStyle = (
  percentage: number,
  isDark: boolean,
): JSX.CSSProperties => ({
  height: "100%",
  backgroundColor: isDark ? "#cbd5e1" : "#475569",
  borderRadius: 4,
  width: `${Math.min(100, Math.max(0, percentage * 100))}%`,
  transition: "width 0.3s ease",
});

const SpinnerIndicator = (
  { spinner, isDark }: { spinner: ActiveSpinner; isDark: boolean },
) => (
  <div style={indicatorTextStyle(isDark)}>
    <span>{spinner.authorName}: {spinner.text}</span>
    <style>
      {`@keyframes indeterminate {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(200px); }
      }`}
    </style>
    <div style={linearBarTrackStyle(isDark)}>
      <div
        style={{
          height: "100%",
          width: 60,
          backgroundColor: isDark ? "#cbd5e1" : "#475569",
          borderRadius: 4,
          animation: "indeterminate 1.2s linear infinite",
        }}
      />
    </div>
  </div>
);

const ProgressIndicator = (
  { progress, isDark }: { progress: ActiveProgress; isDark: boolean },
) => (
  <div style={indicatorTextStyle(isDark)}>
    <span>
      {progress.authorName}: {progress.text}{" "}
      ({Math.round(progress.percentage * 100)}%)
    </span>
    <div style={linearBarTrackStyle(isDark)}>
      <div style={linearBarFillStyle(progress.percentage, isDark)} />
    </div>
  </div>
);

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

const titleStyle = (isDark: boolean, customColors?: CustomColors) => ({
  textAlign: "center",
  fontWeight: "bold",
  fontSize: "1.2em",
  padding: "0.7em 0 0.5em 0",
  background: customColors?.primary ?? (isDark ? "#2563eb" : "#3182ce"),
  color: "#ffffff",
  borderBottom: `1px solid ${isDark ? "#ffffff10" : "#00000008"}`,
});

const messageContainerStyle = (isDark: boolean) => ({
  display: "flex",
  flex: "1 1 0",
  minHeight: 0,
  overflowY: "auto",
  overscrollBehavior: "contain",
  WebkitOverflowScrolling: "touch",
  scrollbarGutter: "auto",
  gap: 8,
  transition: "background 0.2s",
  flexDirection: "column",
  scrollbarColor: isDark ? "#374151 #181c23" : "#cbd5e1 #f8fafc",
  padding: 4,
});

const messageContainerDataAttr = { "data-scrollable": true };

const sendButtonStyle = (
  isDark: boolean,
  customColors?: CustomColors,
) => {
  const primaryColor = customColors?.primary ??
    (isDark ? "#2563eb" : "#3182ce");
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 44,
    height: 44,
    borderRadius: "50%",
    border: "none",
    background: primaryColor,
    color: "#fff",
    cursor: "pointer",
    boxShadow: isDark
      ? "0 2px 8px rgba(0,0,0,0.25)"
      : "0 2px 8px rgba(0,0,0,0.15)",
    transition: "background 0.2s, transform 0.1s",
    flexShrink: 0,
  };
};

const recordingIndicatorStyle = (isDark: boolean): JSX.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 16px",
  background: isDark ? "#dc2626" : "#ef4444",
  color: "#fff",
  fontSize: 14,
  fontWeight: 500,
  justifyContent: "space-between",
});

export const AbstractChatBox = (
  {
    limit,
    loadMore,
    userId,
    onSend,
    onSendWithAttachments,
    messages,
    onClose,
    title,
    emptyMessage,
    typingUsers = [],
    onInputActivity,
    isLoading = false,
    darkModeOverride,
    customColors,
    onDecryptAttachment,
    enableAttachments = false,
    enableAudioRecording = false,
    onEdit,
    activeSpinners = [],
    activeProgress = [],
  }: {
    userId: string;
    onSend: (input: string) => void;
    onSendWithAttachments?: (
      input: string,
      files: File[],
      audioDuration?: number,
    ) => Promise<void>;
    messages: AbstracChatMessage[];
    limit: number;
    loadMore: () => void;
    onClose?: () => void;
    title: string;
    emptyMessage?: ComponentChildren;
    typingUsers?: string[];
    onInputActivity?: () => void;
    isLoading?: boolean;
    darkModeOverride?: boolean;
    customColors?: CustomColors;
    onDecryptAttachment?: (url: string) => Promise<string>;
    enableAttachments?: boolean;
    enableAudioRecording?: boolean;
    onEdit?: (messageId: string, newText: string) => void;
    activeSpinners?: ActiveSpinner[];
    activeProgress?: ActiveProgress[];
  },
): JSX.Element => {
  const isMobile = useIsMobile();
  const [fetchingMore, setFetchingMore] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingStartTimeRef = useRef<number>(0);
  const sessionStartRef = useRef<number>(Date.now());
  const initialLoadRef = useRef(true);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isSending, setIsSending] = useState(false);
  const pendingAudioMessageCountRef = useRef<number | null>(null);
  const [isRecordingLocked, setIsRecordingLocked] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [swipeOffset, setSwipeOffset] = useState({ x: 0, y: 0 });

  const stopRecording = (save: boolean) => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      if (save) {
        recorder.requestData();
        recorder.stop();
      } else {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        recorder.stop();
        streamRef.current?.getTracks().forEach((t) => t.stop());
      }
    }
    setIsRecording(false);
    setRecordingDuration(0);
    setIsRecordingLocked(false);
    setSwipeOffset({ x: 0, y: 0 });
    touchStartRef.current = null;
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };
      recorder.onstop = async () => {
        const capturedDuration = Math.round(
          (Date.now() - recordingStartTimeRef.current) / 1000,
        );
        if (audioChunksRef.current.length === 0) {
          streamRef.current?.getTracks().forEach((t) => t.stop());
          return;
        }
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const file = new File([blob], `recording-${Date.now()}.webm`, {
          type: "audio/webm",
        });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        setRecordingDuration(0);
        if (onSendWithAttachments) {
          pendingAudioMessageCountRef.current = messages.length;
          setIsSending(true);
          await onSendWithAttachments(
            "",
            [file],
            capturedDuration > 0 ? capturedDuration : 1,
          );
        }
      };
      recorder.start(100);
      setIsRecording(true);
      setRecordingDuration(0);
      recordingStartTimeRef.current = Date.now();
      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration((d) => d + 1);
      }, 1000) as unknown as number;
    } catch {
      console.error("Could not access microphone");
    }
  };

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
  const systemDarkMode = useDarkMode();
  const isDark = darkModeOverride !== undefined
    ? darkModeOverride
    : systemDarkMode;

  // Clear sending indicator when new message arrives
  useEffect(() => {
    if (!isSending) return;
    const hasNewAudioMessage = messages.some((m) =>
      m.timestamp > sessionStartRef.current &&
      m.attachments?.some((a) => a.type === "audio")
    );
    if (hasNewAudioMessage) {
      pendingAudioMessageCountRef.current = null;
      setIsSending(false);
    }
  }, [messages, isSending]);

  const scrollToBottom = (instant?: boolean) => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const behavior = instant || initialLoadRef.current ? "instant" : "smooth";
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.scrollTo({ top: el.scrollHeight, behavior });
      });
    });
  };

  // Scroll to bottom when messages or typing indicator change
  useEffect(() => {
    scrollToBottom();
    if (messages.length > 0) initialLoadRef.current = false;
  }, [messages.length, typingUsers.length, isSending]);

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
    <div style={chatContainerStyle(isDark, customColors)}>
      <KebabHoverStyle />
      {!customColors?.hideTitle && (
        <div style={titleStyle(isDark, customColors)}>{title}</div>
      )}
      {onClose && <CloseButton onClose={onClose} />}
      <div
        ref={messagesContainerRef}
        style={messageContainerStyle(isDark)}
        {...messageContainerDataAttr}
      >
        {isLoading
          ? (
            <div style={centerFillStyle(isDark)}>
              <Spinner />
            </div>
          )
          : messages.length === 0
          ? (
            <div
              style={centerFillStyle(isDark)}
            >
              {emptyMessage ?? "No messages yet. Start the conversation!"}
            </div>
          )
          : (
            <>
              {buildTimeline(messages, activeSpinners, activeProgress).map(
                (entry) =>
                  entry.kind === "message"
                    ? (
                      <Message
                        key={entry.msg.id}
                        isOwn={entry.msg.authorId === userId}
                        msg={entry.msg}
                        prev={entry.prevMsg}
                        onDecryptAttachment={onDecryptAttachment}
                        sessionStart={sessionStartRef.current}
                        onEdit={onEdit &&
                          ((newText: string) => onEdit(entry.msg.id, newText))}
                        customColors={customColors}
                      />
                    )
                    : entry.kind === "spinner"
                    ? (
                      <SpinnerIndicator
                        key={`spinner-${entry.spinner.elementId}`}
                        spinner={entry.spinner}
                        isDark={isDark}
                      />
                    )
                    : (
                      <ProgressIndicator
                        key={`progress-${entry.progress.elementId}`}
                        progress={entry.progress}
                        isDark={isDark}
                      />
                    ),
              )}
              {isSending && <SendingAudioIndicator isDark={isDark} />}
              {/* Typing indicator */}
              {typingUsers.length > 0 && (
                <TypingIndicator names={typingUsers} isDark={isDark} />
              )}
              <div ref={messagesEndRef} />
            </>
          )}
      </div>
      {pendingFiles.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 8,
            padding: "8px 12px",
            background: isDark ? "#1f2937" : "#e2e8f0",
            flexWrap: "wrap",
          }}
        >
          {pendingFiles.map((f, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 8px",
                background: isDark ? "#374151" : "#cbd5e1",
                borderRadius: 4,
                fontSize: 12,
              }}
            >
              <span>{f.name}</span>
              <button
                type="button"
                onClick={() =>
                  setPendingFiles(pendingFiles.filter((_, j) => j !== i))}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: isDark ? "#9ca3af" : "#64748b",
                  padding: 2,
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      {isRecording && (
        <div style={recordingIndicatorStyle(isDark)}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ animation: "pulse 1s infinite" }}>🔴</span>
            <span>Recording... {formatDuration(recordingDuration)}</span>
          </div>
          {isMobile && !isRecordingLocked && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                fontSize: 12,
              }}
            >
              <span
                style={{
                  opacity: 0.6 + Math.min(0.4, Math.abs(swipeOffset.x) / 50),
                  transform: `translateX(${Math.min(0, swipeOffset.x / 3)}px)`,
                  transition: "opacity 0.15s",
                }}
              >
                ← slide to cancel
              </span>
              <span
                style={{
                  opacity: 0.4 + Math.min(0.6, Math.abs(swipeOffset.y) / 30),
                  transform: `translateY(${Math.min(0, swipeOffset.y / 3)}px)`,
                  transition: "opacity 0.15s",
                }}
              >
                ↑ lock
              </span>
            </div>
          )}
          {isMobile && isRecordingLocked && (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() =>
                  stopRecording(false)}
                style={{
                  background: "rgba(255,255,255,0.2)",
                  border: "none",
                  borderRadius: 4,
                  padding: "6px 14px",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 500,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => stopRecording(true)}
                style={{
                  background: "rgba(255,255,255,0.3)",
                  border: "none",
                  borderRadius: 4,
                  padding: "6px 14px",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 500,
                }}
              >
                Send
              </button>
            </div>
          )}
          {!isMobile && (
            <button
              type="button"
              onClick={() => stopRecording(false)}
              style={{
                background: "rgba(255,255,255,0.2)",
                border: "none",
                borderRadius: 4,
                padding: "4px 12px",
                color: "#fff",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              Cancel
            </button>
          )}
        </div>
      )}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 8,
          flex: "0 0 auto",
          padding: "8px 12px",
          background: customColors?.inputBackground ??
            (isDark ? "#0f1318" : "#f8fafc"),
          maxWidth: customColors?.inputMaxWidth,
          ...(customColors?.inputMaxWidth
            ? { margin: "0 auto", width: "100%" }
            : {}),
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            const files = Array.from(e.currentTarget.files ?? []);
            setPendingFiles([...pendingFiles, ...files]);
            e.currentTarget.value = "";
          }}
        />
        <div
          style={{
            position: "relative",
            flexGrow: 1,
            display: "flex",
            alignItems: "flex-end",
          }}
        >
          {enableAttachments && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: isDark ? "#6b7280" : "#94a3b8",
                padding: 4,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              title="Attach file"
            >
              <FaPaperclip size={16} />
            </button>
          )}
          <textarea
            dir="auto"
            ref={inputRef}
            value={input}
            rows={1}
            placeholder="Type a message..."
            onInput={(e) => {
              setInput(e.currentTarget.value);
              resizeTextarea(e.currentTarget);
              onInputActivity?.();
            }}
            onBlur={() => onInputActivity?.()}
            style={{
              width: "100%",
              padding: enableAttachments ? "10px 36px 10px 16px" : "10px 16px",
              border: "none",
              borderRadius: 22,
              background: isDark ? "#1f2937" : "#e2e8f0",
              color: isDark ? "#f3f4f6" : "#1e293b",
              fontSize: 16,
              outline: "none",
              resize: "none",
              boxSizing: "border-box",
              height: 44,
              minHeight: 44,
              margin: 0,
              overflowY: "auto",
              overflowX: "hidden",
              maxHeight: 200,
              lineHeight: 1.5,
              transition: "background 0.2s, color 0.2s",
              fontFamily: "inherit",
              letterSpacing: 0.1,
              scrollbarColor: isDark ? "#374151 #1f2937" : "#cbd5e1 #e2e8f0",
              scrollbarWidth: "thin",
            }}
            onKeyDown={(e) => {
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
                  return;
                }
              }
              if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey) {
                if (isMobile) return;
                const canSend = input.trim() || pendingFiles.length > 0;
                if (canSend && !isSending) {
                  handleSend();
                }
                e.preventDefault();
              } else if (
                e.key === "Enter" && (e.shiftKey || e.ctrlKey)
              ) {
                const selectionStart = e.currentTarget.selectionStart ??
                  input.length;
                const selectionEnd = e.currentTarget.selectionEnd ??
                  input.length;
                const newValue = input.slice(0, selectionStart) + "\n" +
                  input.slice(selectionEnd);
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
              onInputActivity?.();
            }}
          />
        </div>
        {(() => {
          const hasContent = input.trim() || pendingFiles.length > 0;
          const showMic = enableAudioRecording && !hasContent && !isRecording;
          const showStop = isRecording && !isRecordingLocked;
          const showSend = hasContent || (isRecording && isRecordingLocked);
          const primaryColor = customColors?.primary ??
            (isDark ? "#2563eb" : "#3182ce");

          const handleButtonClick = () => {
            if (showMic) {
              if (!isMobile) startRecording();
            } else if (showStop) {
              if (!isMobile) stopRecording(true);
            } else if (isRecordingLocked) {
              stopRecording(true);
            } else {
              handleSend();
            }
          };

          const handleTouchStart = isMobile
            ? (e: TouchEvent) => {
              e.preventDefault();
              if (showSend && !isRecordingLocked) return;
              if (isRecordingLocked) return;
              const touch = e.touches[0];
              touchStartRef.current = { x: touch.clientX, y: touch.clientY };
              setSwipeOffset({ x: 0, y: 0 });
              if (showMic) startRecording();
            }
            : undefined;

          const handleTouchMove = isMobile
            ? (e: TouchEvent) => {
              e.preventDefault();
              if (!touchStartRef.current || isRecordingLocked) return;
              const touch = e.touches[0];
              const dx = touch.clientX - touchStartRef.current.x;
              const dy = touch.clientY - touchStartRef.current.y;
              setSwipeOffset({ x: dx, y: dy });
              if (dx < -80) {
                stopRecording(false);
              } else if (dy < -60) {
                setIsRecordingLocked(true);
                setSwipeOffset({ x: 0, y: 0 });
              }
            }
            : undefined;

          const handleTouchEnd = isMobile
            ? (e: TouchEvent) => {
              e.preventDefault();
              if (showSend && !isRecording) {
                handleSend();
                return;
              }
              if (isRecordingLocked) return;
              if (isRecording) stopRecording(true);
            }
            : undefined;

          const handleTouchCancel = isMobile
            ? (e: TouchEvent) => {
              e.preventDefault();
              if (isRecordingLocked) return;
              if (isRecording) stopRecording(false);
            }
            : undefined;

          return (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={isMobile ? undefined : handleButtonClick}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={handleTouchCancel}
              style={{
                ...sendButtonStyle(isDark, customColors),
                background: showStop ? "#dc2626" : primaryColor,
                touchAction: "none",
                position: "relative",
                overflow: "hidden",
              }}
              title={showMic
                ? (isMobile ? "Hold to record" : "Record audio")
                : showStop
                ? "Stop recording"
                : "Send"}
            >
              <span
                style={{
                  position: "absolute",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "transform 0.2s ease, opacity 0.2s ease",
                  transform: showMic
                    ? "scale(1) rotate(0deg)"
                    : "scale(0) rotate(-90deg)",
                  opacity: showMic ? 1 : 0,
                }}
              >
                <FaMicrophone size={20} />
              </span>
              <span
                style={{
                  position: "absolute",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "transform 0.2s ease, opacity 0.2s ease",
                  transform: showStop
                    ? "scale(1) rotate(0deg)"
                    : "scale(0) rotate(90deg)",
                  opacity: showStop ? 1 : 0,
                }}
              >
                <FaStop size={18} />
              </span>
              <span
                style={{
                  position: "absolute",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "transform 0.2s ease, opacity 0.2s ease",
                  transform: showSend
                    ? "scale(1) rotate(0deg)"
                    : "scale(0) rotate(90deg)",
                  opacity: showSend ? 1 : 0,
                }}
              >
                <FaPaperPlane size={18} />
              </span>
            </button>
          );
        })()}
      </div>
      {fetchingMore && <div style={loadingStyle}>Loading more...</div>}
    </div>
  );

  async function handleSend() {
    const text = input.trim();
    const files = [...pendingFiles];
    if (!text && files.length === 0) return;

    setInput("");
    setPendingFiles([]);
    onInputActivity?.();

    if (files.length > 0 && onSendWithAttachments) {
      setIsSending(true);
      await onSendWithAttachments(text, files);
      setIsSending(false);
    } else if (text) {
      onSend(text);
    }

    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.style.height = "auto";
      }
      scrollToBottom();
    }, 0);
  }
};
