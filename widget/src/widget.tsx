import { signal } from "@preact/signals";
import { coerce } from "@uri/gamla";
import type { JSX } from "preact";
import { createPortal } from "preact/compat";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { toast } from "react-hot-toast";
import { useDarkMode, useIsMobile } from "../../clients/react/src/hooks.ts";
import {
  Chat,
  type Credentials,
  useGetOrCreateConversation,
} from "../../mod.ts";
import { Spinner, widgetColors } from "../../clients/react/src/design.tsx";

const fontStack = [
  "Inter",
  "ui-sans-serif",
  "system-ui",
  "-apple-system",
  "Segoe UI",
  "Roboto",
  "Ubuntu",
  "Cantarell",
  "Noto Sans",
  "Helvetica Neue",
  "Arial",
  "Apple Color Emoji",
  "Segoe UI Emoji",
].join(", ");

const widgetBaseCss = `
:host, *, *::before, *::after { font-family: ${fontStack}; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility; }
:host { color-scheme: light dark; }
`;

const getStartButtonStyle = (isDark: boolean): JSX.CSSProperties => ({
  background: isDark
    ? "linear-gradient(90deg, #232526 0%, #414345 100%)"
    : "linear-gradient(90deg, #6a82fb 0%, #fc5c7d 100%)",
  color: isDark ? "#fff" : "#fff",
  fontWeight: "bold",
  padding: "12px 28px",
  border: "none",
  borderRadius: "999px",
  boxShadow: isDark
    ? "0 2px 8px rgba(20, 20, 40, 0.35)"
    : "0 2px 8px rgba(80, 80, 120, 0.15)",
  cursor: "pointer",
  fontSize: "1rem",
  transition: "background 0.2s, box-shadow 0.2s",
  outline: "none",
  margin: "8px",
  display: "inline-block",
});

const chatOpen = signal(false);

const overlayStyle: JSX.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 10002,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "16px",
  fontFamily: fontStack,
};

const dialogBoxStyle = (isDark: boolean): JSX.CSSProperties => ({
  background: isDark ? "#2a2a2a" : "#ffffff",
  color: isDark ? "#f3f4f6" : "#111827",
  width: "100%",
  maxWidth: 420,
  borderRadius: 12,
  boxShadow: isDark
    ? "0 10px 30px rgba(0,0,0,0.5)"
    : "0 10px 30px rgba(0,0,0,0.12)",
  padding: 20,
});

const fieldStyle = (isDark: boolean): JSX.CSSProperties => ({
  width: "100%",
  maxWidth: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${isDark ? "#4b5563" : "#d1d5db"}`,
  background: isDark ? "#374151" : "#f9fafb",
  color: isDark ? "#f9fafb" : "#111827",
  outline: "none",
});

const actionsRowStyle: JSX.CSSProperties = {
  display: "flex",
  gap: 8,
  justifyContent: "flex-end",
  marginTop: 12,
};

const buttonNeutralStyle = (isDark: boolean): JSX.CSSProperties => ({
  background: isDark ? "#4b5563" : "#e5e7eb",
  color: isDark ? "#f9fafb" : "#111827",
  border: "none",
  borderRadius: 8,
  padding: "8px 12px",
  cursor: "pointer",
});

const buttonPrimaryStyle = (isDark: boolean): JSX.CSSProperties => ({
  background: isDark ? "#2563eb" : "#2563eb",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "8px 12px",
  cursor: "pointer",
});

const nameDialogTitleStyle: JSX.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  marginBottom: 8,
};

const nameDialogHintStyle: JSX.CSSProperties = {
  fontSize: 13,
  opacity: 0.9,
  marginBottom: 10,
};

type NameDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
};

const NameDialog = ({ isOpen, onClose, onSubmit }: NameDialogProps) => {
  const isDark = useDarkMode();
  const [value, setValue] = useState("");
  useEffect(() => {
    if (!isOpen) setValue("");
  }, [isOpen]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter" && isOpen) {
        e.preventDefault();
        const v = value.trim();
        if (!v) {
          toast.error("Please enter your name");
          return;
        }
        onSubmit(v);
      }
    };
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [isOpen, value]);
  if (!isOpen) return null;
  return createPortal(
    <div style={overlayStyle} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        style={dialogBoxStyle(isDark)}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={nameDialogTitleStyle}>Enter your display name</div>
        <div style={nameDialogHintStyle}>This will be shown to others.</div>
        <input
          autoFocus
          value={value}
          onInput={(e) => setValue(e.currentTarget.value)}
          placeholder="Your name"
          style={fieldStyle(isDark)}
        />
        <div style={actionsRowStyle}>
          <button
            type="button"
            style={buttonNeutralStyle(isDark)}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            style={buttonPrimaryStyle(isDark)}
            onClick={() => {
              const v = value.trim();
              if (!v) {
                toast.error("Please enter your name");
                return;
              }
              onSubmit(v);
            }}
          >
            Continue
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

const Loading = () => {
  const isDark = useDarkMode();
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...widgetColors(isDark),
      }}
    >
      <Spinner />
    </div>
  );
};

const WithCredentials = (
  { dialTo, credentials, initialMessage }: {
    dialTo: string[];
    credentials: Credentials;
    initialMessage?: string;
  },
) => {
  const conversation = useGetOrCreateConversation({
    credentials,
    participants: dialTo,
    initialMessage,
  });
  return conversation
    ? (
      <Chat
        onClose={() => {
          chatOpen.value = false;
        }}
        credentials={coerce(credentials)}
        conversationId={conversation}
      />
    )
    : <Loading />;
};

const overlayZIndex = 10000;

const commonContainerProps = {
  position: "absolute",
  flexDirection: "column",
};

const fixedPosition = {
  right: 24,
  position: "absolute",
  bottom: 24,
};

const containerStyle = (
  { isMobile, isDark, isOpen }: {
    isMobile: boolean;
    isDark: boolean;
    isOpen: boolean;
  },
): JSX.CSSProperties => (
  isOpen
    ? (isMobile
      ? {
        ...commonContainerProps,
        inset: 0,
        width: "100vw",
        height: "100dvh",
        display: "flex",
      }
      : {
        ...commonContainerProps,
        ...fixedPosition,
        width: "min(400px, 90vw)",
        height: "min(80dvh, 720px)",
        maxWidth: "calc(100vw - 48px)",
        maxHeight: "calc(100dvh - 48px)",
        boxShadow: isDark
          ? "0 10px 30px rgba(0,0,0,0.5)"
          : "0 10px 30px rgba(0,0,0,0.12)",
        display: "flex",
        borderRadius: 12,
        overflow: "hidden",
      })
    : {
      ...fixedPosition,
      display: "flex",
      flexDirection: "column",
    }
);

const closeButtonStyle = (isDark: boolean): JSX.CSSProperties => ({
  position: "absolute",
  top: 8,
  right: 8,
  width: 32,
  height: 32,
  borderRadius: 16,
  border: "none",
  background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
  color: isDark ? "#f3f4f6" : "#111827",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: isDark
    ? "0 2px 6px rgba(0,0,0,0.4)"
    : "0 2px 6px rgba(0,0,0,0.15)",
});

const Overlay = () => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      zIndex: overlayZIndex,
      background: "transparent",
      touchAction: "none",
      pointerEvents: "none",
    }}
    onTouchMove={(e) => e.preventDefault()}
    onWheel={(e) => e.preventDefault()}
  />
);

export type WidgetParams = {
  participants: string[];
  initialMessage?: string;
  startOpen?: boolean;
  buttonText?: string;
  defaultName?: string;
};

type WidgetProps = {
  credentials: Credentials | null;
  onNameChosen: (name: string) => void;
} & WidgetParams;

const InnerWidget = ({
  onNameChosen,
  participants,
  credentials,
  startOpen,
  initialMessage,
  buttonText,
}: WidgetProps) => {
  const isMobile = useIsMobile();
  const isDark = useDarkMode();
  const [showNameDialog, setNameDialog] = useState(false);
  useEffect(() => {
    if (!startOpen) return;
    if (chatOpen.value) return;
    if (credentials) {
      chatOpen.value = true;
    } else {
      setNameDialog(true);
    }
  }, [startOpen, credentials]);
  useEffect(() => {
    if (isMobile && chatOpen.value) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isMobile, chatOpen.value]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && chatOpen.value) chatOpen.value = false;
    };
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [chatOpen.value]);
  return (
    <>
      <NameDialog
        isOpen={showNameDialog}
        onClose={() => setNameDialog(false)}
        onSubmit={(name) => {
          onNameChosen(name);
          setNameDialog(false);
          chatOpen.value = true;
        }}
      />
      {isMobile && chatOpen.value && <Overlay />}
      {chatOpen.value
        ? credentials
          ? (
            <WithCredentials
              initialMessage={initialMessage}
              dialTo={participants}
              credentials={credentials}
            />
          )
          : <Loading />
        : (
          <button
            type="button"
            style={getStartButtonStyle(isDark)}
            onClick={() => {
              if (credentials) {
                chatOpen.value = true;
                return;
              }
              setNameDialog(true);
            }}
          >
            {buttonText ?? (credentials ? "Chat" : "Start chat")}
          </button>
        )}
    </>
  );
};

export const Widget = (props: WidgetProps): JSX.Element => {
  const hostRef = useRef<HTMLDivElement>(null);
  const [shadowRoot, setShadowRoot] = useState<ShadowRoot | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const isDark = useDarkMode();
  useLayoutEffect(() => {
    if (hostRef.current && !shadowRoot) {
      const root = hostRef.current.attachShadow({ mode: "open" });
      const host = hostRef.current;
      host.setAttribute("dir", "ltr");
      host.style.setProperty("display", "block", "important");
      host.style.setProperty("position", "fixed", "important");
      host.style.setProperty("inset", "0", "important");
      host.style.setProperty("pointer-events", "none", "important");
      host.style.setProperty("z-index", "999999", "important");
      setShadowRoot(root);
    }
  }, [hostRef.current, shadowRoot]);
  return (
    <div ref={hostRef}>
      {shadowRoot &&
        createPortal(
          <div>
            <style>{widgetBaseCss}</style>
            <div
              ref={containerRef}
              style={{
                ...containerStyle({ isMobile, isDark, isOpen: chatOpen.value }),
                pointerEvents: "auto",
              }}
            >
              {chatOpen.value && (
                <button
                  type="button"
                  aria-label="Close chat"
                  style={closeButtonStyle(isDark)}
                  onClick={() => (chatOpen.value = false)}
                >
                  ×
                </button>
              )}
              <InnerWidget {...props} />
            </div>
          </div>,
          shadowRoot,
        )}
    </div>
  );
};
