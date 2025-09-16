import { signal } from "@preact/signals";
import { coerce } from "gamla";
import type { JSX } from "preact";
import { createPortal } from "preact/compat";
import { useEffect, useRef, useState } from "preact/hooks";
import { useDarkMode, useIsMobile } from "../../clients/react/src/hooks.ts";
import {
  Chat,
  type Credentials,
  useGetOrCreateConversation,
} from "../../mod.ts";
import { registerPush } from "../../protocol/src/pushClient.ts";

const enableConversationPush = (
  credentials: Credentials,
  conversationId: string,
) => registerPush(credentials, { conversationId });

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

const WithCredentials = (
  { dialTo, credentials }: { dialTo: string[]; credentials: Credentials },
) => {
  const conversation = useGetOrCreateConversation({
    credentials,
    participants: dialTo,
  });
  const isDark = useDarkMode();
  return conversation
    ? (
      <div style={{ flex: 1, display: "flex", minHeight: 0, height: "100%" }}>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          <div
            style={{ display: "flex", justifyContent: "flex-end", padding: 8 }}
          >
            <button
              type="button"
              style={{
                padding: "6px 10px",
                fontSize: 12,
                borderRadius: 6,
                border: "1px solid #ccc",
                background: "#fff",
                cursor: "pointer",
              }}
              onClick={() => {
                enableConversationPush(credentials, conversation)
                  .catch((e) => {
                    console.error("Failed to enable push for conversation", e);
                    alert("Failed to enable notifications for this chat.");
                  });
              }}
            >
              Enable notifications
            </button>
          </div>
          <Chat
            onClose={() => {
              chatOpen.value = false;
            }}
            credentials={coerce(credentials)}
            conversationId={conversation}
          />
        </div>
      </div>
    )
    : (
      <div style={getStartButtonStyle(isDark)}>
        <p>Getting/creating conversation...</p>
      </div>
    );
};

const overlayZIndex = 10000;

const Overlay = () => (
  <div
    style={{
      position: "fixed",
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

type WidgetProps = {
  dialTo: string[];
  initialMessage?: string;
  credentials: Credentials | null;
  generateCredentials: () => void;
};

const InnerWidget = (
  { dialTo, credentials, generateCredentials }: WidgetProps,
) => {
  const isMobile = useIsMobile();
  const isDark = useDarkMode();
  useEffect(() => {
    if (isMobile && chatOpen.value) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isMobile, chatOpen.value]);
  return (
    <>
      {isMobile && chatOpen.value && <Overlay />}
      {chatOpen.value
        ? (credentials
          ? <WithCredentials dialTo={dialTo} credentials={credentials} />
          : <p>Loading credentials...</p>)
        : (
          <button
            type="button"
            style={getStartButtonStyle(isDark)}
            onClick={() => {
              chatOpen.value = true;
              if (credentials) return;
              generateCredentials();
            }}
          >
            {credentials ? "Chat" : "Start Chat"}
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
  useEffect(() => {
    if (hostRef.current && !shadowRoot) {
      setShadowRoot(hostRef.current.attachShadow({ mode: "open" }));
    }
  }, [hostRef.current, !shadowRoot]);
  useEffect(() => {
    if (isMobile && chatOpen.value && containerRef.current) {
      const setHeight = () => {
        const height = globalThis.visualViewport?.height ||
          globalThis.innerHeight;
        containerRef.current!.style.height = height + "px";
        containerRef.current!.style.width = "100vw";
      };
      setHeight();
      globalThis.addEventListener("resize", setHeight);
      if (globalThis.visualViewport) {
        globalThis.visualViewport.addEventListener("resize", setHeight);
      }
      return () => {
        globalThis.removeEventListener("resize", setHeight);
        if (globalThis.visualViewport) {
          globalThis.visualViewport.removeEventListener("resize", setHeight);
        }
      };
    } else if (containerRef.current) {
      containerRef.current.style.height = "";
      containerRef.current.style.width = "";
    }
  }, [isMobile, shadowRoot, chatOpen.value]);
  return (
    <div ref={hostRef}>
      {shadowRoot && createPortal(
        <div
          ref={containerRef}
          style={{
            position: "fixed",
            zIndex: 10001,
            inset: isMobile && chatOpen.value ? 0 : undefined,
            width: isMobile && chatOpen.value ? "100vw" : undefined,
            height: isMobile && chatOpen.value ? undefined : undefined,
            background: isMobile && chatOpen.value
              ? (isDark ? "#232526" : "#fff")
              : undefined,
            transition: "height 0.2s",
            display: "flex",
            flexDirection: "column",
            bottom: !isMobile || !chatOpen.value ? 24 : undefined,
            right: !isMobile || !chatOpen.value ? 24 : undefined,
            minHeight: 0,
          }}
        >
          <InnerWidget
            dialTo={props.dialTo}
            credentials={props.credentials}
            generateCredentials={props.generateCredentials}
          />
        </div>,
        shadowRoot,
      )}
    </div>
  );
};
