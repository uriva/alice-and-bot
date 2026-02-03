import { sortKey } from "@uri/gamla";
import { useEffect, useRef, useState } from "preact/hooks";
import {
  FaDownload,
  FaMicrophone,
  FaPaperclip,
  FaPaperPlane,
  FaPause,
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

type VNodeLike = {
  type?: unknown;
  props?: { children?: ComponentChildren };
};

const blockLevelTags = new Set([
  "div",
  "video",
  "audio",
  "pre",
  "table",
  "ul",
  "ol",
  "blockquote",
  "iframe",
]);

const paragraphSpacingStyle: JSX.CSSProperties = { margin: "0 0 8px 0" };

const isVNodeLike = (value: ComponentChildren): value is VNodeLike =>
  typeof value === "object" && value !== null && "type" in (value as VNodeLike);

const hasBlockLevelChild = (children: ComponentChildren): boolean => {
  if (children === null || children === undefined) return false;
  if (Array.isArray(children)) return children.some(hasBlockLevelChild);
  if (isVNodeLike(children)) {
    const type = children.type;
    if (typeof type === "string" && blockLevelTags.has(type)) return true;
    const nested = children.props?.children;
    if (nested) return hasBlockLevelChild(nested);
  }
  return false;
};

const MarkdownParagraph = ({ children }: { children?: ComponentChildren }) =>
  hasBlockLevelChild(children)
    ? <div style={paragraphSpacingStyle}>{children}</div>
    : <p style={paragraphSpacingStyle}>{children}</p>;

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
  { src, isDark }: { src: string; isDark: boolean },
): JSX.Element => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration);
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
            {duration ? formatDuration(Math.floor(duration)) : "--:--"}
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
  { attachment, textColor, isDark, onDecrypt }: {
    attachment: Attachment;
    textColor: string;
    isDark: boolean;
    onDecrypt?: (url: string) => Promise<string>;
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

  if (attachment.type === "audio") {
    return decryptedUrl
      ? <AudioPlayer src={decryptedUrl} isDark={isDark} />
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
              style={{ display: "flex", alignItems: "center", gap: 2 }}
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
  next: AbstracChatMessage | undefined;
  isOwn: boolean;
  onDecryptAttachment?: (url: string) => Promise<string>;
};

const Message = (
  {
    msg: { authorId, authorName, authorAvatar, text, timestamp, attachments },
    next,
    isOwn,
    onDecryptAttachment,
  }: MessageProps,
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
          overflowX: "hidden",
          overflowY: "hidden",
          wordBreak: "break-word",
          overflowWrap: "anywhere",
        }}
      >
        <b style={{ fontSize: 11 }}>{authorName}</b>
        {text && (
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
              />
            ))}
          </div>
        )}
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
  attachments?: Attachment[];
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
  scrollbarGutter: "auto",
  gap: 8,
  transition: "background 0.2s",
  flexDirection: "column",
  scrollbarColor: isDark ? "#374151 #181c23" : "#cbd5e1 #f8fafc",
  padding: 4,
});

const sendButtonStyle = (
  isDark: boolean,
  disabled: boolean,
  customColors?: CustomColors,
) => {
  const primaryColor = customColors?.primary ??
    (isDark ? "#2563eb" : "#3182ce");
  const gradientEnd = customColors?.primary
    ? `${primaryColor}dd` // slightly lighter version
    : (isDark ? "#60a5fa" : "#60a5fa");

  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 18px",
    minHeight: 44,
    height: "100%",
    borderRadius: 0,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 0,
    border: "none",
    background: !disabled
      ? `linear-gradient(90deg, ${primaryColor} 60%, ${gradientEnd} 100%)`
      : (isDark ? "#23272f" : "#cbd5e1"),
    color: !disabled ? "#fff" : (isDark ? "#aaa" : "#64748b"),
    fontWeight: 600,
    fontSize: 15,
    cursor: !disabled ? "pointer" : "not-allowed",
    boxShadow: isDark
      ? "0 2px 8px rgba(0,0,0,0.18)"
      : "0 2px 8px rgba(0,0,0,0.08)",
    transition: "background 0.2s, color 0.2s, box-shadow 0.2s",
    opacity: !disabled ? 1 : 0.7,
    gap: 7,
  };
};

const iconButtonStyle = (isDark: boolean): JSX.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 40,
  height: 44,
  background: isDark ? "#181c23" : "#f1f5f9",
  border: "none",
  cursor: "pointer",
  color: isDark ? "#9ca3af" : "#64748b",
  transition: "color 0.2s, background 0.2s",
});

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
  }: {
    userId: string;
    onSend: (input: string) => void;
    onSendWithAttachments?: (input: string, files: File[]) => Promise<void>;
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
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isSending, setIsSending] = useState(false);

  const stopRecording = (save: boolean) => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    if (mediaRecorderRef.current && isRecording) {
      if (save) {
        mediaRecorderRef.current.stop();
      } else {
        mediaRecorderRef.current.ondataavailable = null;
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stop();
        streamRef.current?.getTracks().forEach((t) => t.stop());
      }
    }
    setIsRecording(false);
    setRecordingDuration(0);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const file = new File([blob], `recording-${Date.now()}.webm`, {
          type: "audio/webm",
        });
        setPendingFiles((prev) => [...prev, file]);
        streamRef.current?.getTracks().forEach((t) => t.stop());
        setRecordingDuration(0);
      };
      recorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
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

  // Scroll to bottom when messages or typing indicator change
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [messages.length, typingUsers.length]);

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
      <div style={titleStyle(isDark, customColors)}>{title}</div>
      {onClose && <CloseButton onClose={onClose} />}
      <div ref={messagesContainerRef} style={messageContainerStyle(isDark)}>
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
                  onDecryptAttachment={onDecryptAttachment}
                />
              ))}
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
          alignItems: "stretch",
          gap: 0,
          flex: "0 0 auto",
          minHeight: 44,
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
        {enableAttachments && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={iconButtonStyle(isDark)}
            title="Attach file"
          >
            <FaPaperclip size={18} />
          </button>
        )}
        {enableAudioRecording && (
          <button
            type="button"
            onClick={isMobile ? undefined : async () => {
              if (isRecording) {
                stopRecording(true);
              } else {
                await startRecording();
              }
            }}
            onTouchStart={isMobile ? () => startRecording() : undefined}
            onTouchEnd={isMobile ? () => stopRecording(true) : undefined}
            onTouchCancel={isMobile ? () => stopRecording(false) : undefined}
            style={{
              ...iconButtonStyle(isDark),
              color: isRecording ? "#dc2626" : (isDark ? "#9ca3af" : "#64748b"),
            }}
            title={isMobile
              ? "Hold to record"
              : isRecording
              ? "Stop recording"
              : "Record audio"}
          >
            {isRecording ? <FaStop size={18} /> : <FaMicrophone size={18} />}
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
            flexGrow: 1,
            padding: "10px 16px",
            border: "none",
            borderTopLeftRadius: enableAttachments || enableAudioRecording
              ? 0
              : 10,
            borderBottomLeftRadius: 0,
            borderTopRightRadius: 0,
            borderBottomRightRadius: 0,
            background: isDark ? "#181c23" : "#f1f5f9",
            color: isDark ? "#f3f4f6" : "#1e293b",
            fontSize: 16,
            outline: "none",
            resize: "none",
            boxSizing: "border-box",
            height: 44,
            minHeight: 44,
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
              const selectionEnd = e.currentTarget.selectionEnd ?? input.length;
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
        <button
          type="button"
          disabled={(!input.trim() && pendingFiles.length === 0) || isSending}
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleSend}
          style={sendButtonStyle(
            isDark,
            (!input.trim() && pendingFiles.length === 0) || isSending,
            customColors,
          )}
          title="Send"
        >
          <span
            style={{
              display: "flex",
              alignItems: "center",
              marginRight: 0,
              color: (input.trim() || pendingFiles.length > 0) && !isSending
                ? "#fff"
                : "#64748b",
              filter: (input.trim() || pendingFiles.length > 0) && !isSending
                ? "drop-shadow(0 1px 2px #0002)"
                : "none",
              opacity: (input.trim() || pendingFiles.length > 0) && !isSending
                ? 0.95
                : 0.7,
              transition: "color 0.2s, filter 0.2s",
            }}
          >
            <FaPaperPlane size={20} />
          </span>
          <span>{isSending ? "..." : "Send"}</span>
        </button>
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
    }, 0);
  }
};
