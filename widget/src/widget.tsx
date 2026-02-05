import { signal } from "@preact/signals";
import { coerce } from "@uri/gamla";
import type { JSX } from "preact";
import { createPortal } from "preact/compat";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { toast } from "react-hot-toast";
import {
  setDarkModeOverride,
  useDarkMode,
  useIsMobile,
} from "../../clients/react/src/hooks.ts";
import {
  Chat,
  type Credentials,
  useGetOrCreateConversation,
} from "../../mod.ts";
import { Spinner } from "../../clients/react/src/design.tsx";

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

const widgetBaseCss = (colorScheme: "light" | "dark" | "light dark") => `
:host, *, *::before, *::after { font-family: ${fontStack}; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility; }
:host { color-scheme: ${colorScheme}; }
`;

type WidgetMode = "light" | "dark";

export type ExportedWidgetModeColors = {
  primary: string;
  background: string;
  startButton: string;
  startButtonText: string;
};

type WidgetModeColors = {
  background: string;
  text: string;
  surface: string;
  border: string;
  overlay: string;
  primary: string;
  primaryText: string;
  neutralBg: string;
  neutralText: string;
  startButton: string;
  startButtonText: string;
  startShadow: string;
  inputBackground: string;
  inputBorder: string;
  inputText: string;
  closeButtonBg: string;
  closeButtonColor: string;
};

export type WidgetColorScheme = {
  light?: Partial<ExportedWidgetModeColors>;
  dark?: Partial<ExportedWidgetModeColors>;
};

const defaultColors: Record<WidgetMode, WidgetModeColors> = {
  light: {
    background: "#ffffff",
    text: "#111827",
    surface: "#ffffff",
    border: "#d1d5db",
    overlay: "rgba(0,0,0,0.4)",
    primary: "#2563eb",
    primaryText: "#ffffff",
    neutralBg: "#e5e7eb",
    neutralText: "#111827",
    startButton: "#2563eb",
    startButtonText: "#ffffff",
    startShadow: "0 2px 8px rgba(80, 80, 120, 0.15)",
    inputBackground: "#f9fafb",
    inputBorder: "#d1d5db",
    inputText: "#111827",
    closeButtonBg: "rgba(0,0,0,0.06)",
    closeButtonColor: "#111827",
  },
  dark: {
    background: "#2a2a2a",
    text: "#f3f4f6",
    surface: "#2a2a2a",
    border: "#4b5563",
    overlay: "rgba(0,0,0,0.4)",
    primary: "#2563eb",
    primaryText: "#ffffff",
    neutralBg: "#4b5563",
    neutralText: "#f9fafb",
    startButton: "#2563eb",
    startButtonText: "#ffffff",
    startShadow: "0 2px 8px rgba(20, 20, 40, 0.35)",
    inputBackground: "#374151",
    inputBorder: "#4b5563",
    inputText: "#f9fafb",
    closeButtonBg: "rgba(255,255,255,0.08)",
    closeButtonColor: "#f3f4f6",
  },
};

type ResolvedAppearance = {
  mode: WidgetMode;
  colors: WidgetModeColors;
  colorSchemeValue: "light" | "dark" | "light dark";
};

const resolveAppearance = (
  colorScheme: WidgetColorScheme | undefined,
  prefersDark: boolean,
): ResolvedAppearance => {
  const hasLight = !!colorScheme?.light;
  const hasDark = !!colorScheme?.dark;
  const mode: WidgetMode = hasLight && hasDark
    ? prefersDark ? "dark" : "light"
    : hasDark
    ? "dark"
    : hasLight
    ? "light"
    : prefersDark
    ? "dark"
    : "light";
  const colors = { ...defaultColors[mode], ...(colorScheme?.[mode] ?? {}) };
  const colorSchemeValue: "light" | "dark" | "light dark" = hasLight && hasDark
    ? "light dark"
    : mode;
  return { mode, colors, colorSchemeValue };
};

const getStartButtonStyle = (colors: WidgetModeColors): JSX.CSSProperties => ({
  background: colors.startButton,
  color: colors.startButtonText,
  fontWeight: "bold",
  padding: "12px 28px",
  border: "none",
  borderRadius: "999px",
  boxShadow: colors.startShadow,
  cursor: "pointer",
  fontSize: "1rem",
  transition: "background 0.2s, box-shadow 0.2s",
  outline: "none",
  margin: "8px",
  display: "inline-block",
});

const chatOpen = signal(false);

const overlayStyle = (colors: WidgetModeColors): JSX.CSSProperties => ({
  position: "fixed",
  inset: 0,
  zIndex: 10002,
  background: colors.overlay,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "16px",
  fontFamily: fontStack,
});

const dialogBoxStyle = (
  { colors, mode }: { colors: WidgetModeColors; mode: WidgetMode },
): JSX.CSSProperties => ({
  background: colors.surface,
  color: colors.text,
  width: "100%",
  maxWidth: 420,
  borderRadius: 12,
  boxShadow: mode === "dark"
    ? "0 10px 30px rgba(0,0,0,0.5)"
    : "0 10px 30px rgba(0,0,0,0.12)",
  padding: 20,
});

const fieldStyle = (colors: WidgetModeColors): JSX.CSSProperties => ({
  width: "100%",
  maxWidth: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${colors.inputBorder}`,
  background: colors.inputBackground,
  color: colors.inputText,
  outline: "none",
});

const actionsRowStyle: JSX.CSSProperties = {
  display: "flex",
  gap: 8,
  justifyContent: "flex-end",
  marginTop: 12,
};

const buttonNeutralStyle = (colors: WidgetModeColors): JSX.CSSProperties => ({
  background: colors.neutralBg,
  color: colors.neutralText,
  border: "none",
  borderRadius: 8,
  padding: "8px 12px",
  cursor: "pointer",
});

const buttonPrimaryStyle = (colors: WidgetModeColors): JSX.CSSProperties => ({
  background: colors.primary,
  color: colors.primaryText,
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
  colors: WidgetModeColors;
  mode: WidgetMode;
};

const NameDialog = (
  { isOpen, onClose, onSubmit, colors, mode }: NameDialogProps,
) => {
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
    <div style={overlayStyle(colors)} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        style={dialogBoxStyle({ colors, mode })}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={nameDialogTitleStyle}>Enter your display name</div>
        <div style={nameDialogHintStyle}>This will be shown to others.</div>
        <input
          autoFocus
          value={value}
          onInput={(e) => setValue(e.currentTarget.value)}
          placeholder="Your name"
          style={fieldStyle(colors)}
        />
        <div style={actionsRowStyle}>
          <button
            type="button"
            style={buttonNeutralStyle(colors)}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            style={buttonPrimaryStyle(colors)}
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

const Loading = ({ colors }: { colors: WidgetModeColors }) => (
  <div
    style={{
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: colors.background,
      color: colors.text,
    }}
  >
    <Spinner />
  </div>
);

const WithCredentials = (
  { dialTo, credentials, initialMessage, colors, isDark }: {
    dialTo: string[];
    credentials: Credentials;
    initialMessage?: string;
    colors: WidgetModeColors;
    isDark: boolean;
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
        darkModeOverride={isDark}
        customColors={{
          background: colors.background,
          text: colors.text,
          primary: colors.primary,
        }}
      />
    )
    : <Loading colors={colors} />;
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

const closeButtonStyle = (
  { colors, mode }: { colors: WidgetModeColors; mode: WidgetMode },
): JSX.CSSProperties => ({
  position: "absolute",
  top: 8,
  right: 8,
  width: 32,
  height: 32,
  borderRadius: 16,
  border: "none",
  background: colors.closeButtonBg,
  color: colors.closeButtonColor,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: mode === "dark"
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
  colorScheme?: WidgetColorScheme;
};

type WidgetProps = {
  credentials: Credentials | null;
  onNameChosen: (name: string) => void;
} & WidgetParams;

type InnerWidgetProps = WidgetProps & { appearance: ResolvedAppearance };

const InnerWidget = ({
  onNameChosen,
  participants,
  credentials,
  startOpen,
  initialMessage,
  buttonText,
  appearance,
}: InnerWidgetProps) => {
  const isMobile = useIsMobile();
  const isDark = appearance.mode === "dark";
  const colors = appearance.colors;
  const [showNameDialog, setNameDialog] = useState(false);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);

  useEffect(() => {
    if (!isMobile) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const updateHeight = () => setViewportHeight(vv.height);
    vv.addEventListener("resize", updateHeight);
    updateHeight();
    return () => vv.removeEventListener("resize", updateHeight);
  }, [isMobile]);

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
    <div
      style={{
        height: viewportHeight ? `${viewportHeight}px` : "100%",
        display: "flex",
        flexDirection: "column",
        width: "100%",
      }}
    >
      <NameDialog
        isOpen={showNameDialog}
        mode={appearance.mode}
        colors={colors}
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
              colors={colors}
              isDark={isDark}
            />
          )
          : <Loading colors={colors} />
        : (
          <button
            type="button"
            style={getStartButtonStyle(colors)}
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
    </div>
  );
};

export const Widget = (props: WidgetProps): JSX.Element => {
  const hostRef = useRef<HTMLDivElement>(null);
  const [shadowRoot, setShadowRoot] = useState<ShadowRoot | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const hasLight = !!props.colorScheme?.light;
  const hasDark = !!props.colorScheme?.dark;
  useEffect(() => {
    const override = hasLight && hasDark
      ? null
      : hasDark
      ? "dark"
      : hasLight
      ? "light"
      : null;
    setDarkModeOverride(override);
    return () => setDarkModeOverride(null);
  }, [hasLight, hasDark]);
  const isDark = useDarkMode();
  const appearance = resolveAppearance(props.colorScheme, isDark);
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
            <style>{widgetBaseCss(appearance.colorSchemeValue)}</style>
            <div
              ref={containerRef}
              style={{
                ...containerStyle({
                  isMobile,
                  isDark: appearance.mode === "dark",
                  isOpen: chatOpen.value,
                }),
                pointerEvents: "auto",
              }}
            >
              {chatOpen.value && (
                <button
                  type="button"
                  aria-label="Close chat"
                  style={closeButtonStyle({
                    colors: appearance.colors,
                    mode: appearance.mode,
                  })}
                  onClick={() => (chatOpen.value = false)}
                >
                  ×
                </button>
              )}
              <InnerWidget {...props} appearance={appearance} />
            </div>
          </div>,
          shadowRoot,
        )}
    </div>
  );
};
