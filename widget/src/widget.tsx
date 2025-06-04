import { signal } from "@preact/signals";
import { coerce } from "gamla";
import { useEffect, useRef } from "preact/hooks";
import { useDarkMode, useIsMobile } from "../../clients/react/src/hooks.ts";
import {
  Chat,
  type Credentials,
  useGetOrCreateConversation,
} from "../../mod.ts";

const getStartButtonStyle = (isDark: boolean): preact.JSX.CSSProperties => ({
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
  const conversation = useGetOrCreateConversation(credentials, dialTo);
  const isDark = useDarkMode();
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
      pointerEvents: "auto",
    }}
    onTouchMove={(e) => e.preventDefault()}
    onWheel={(e) => e.preventDefault()}
  />
);

export const Widget = (
  { dialTo, generateCredentials, credentials }: {
    dialTo: string[];
    credentials: Credentials | null;
    generateCredentials: () => void;
  },
) => {
  const isMobile = useIsMobile();
  const isDark = useDarkMode();
  const containerRef = useRef<HTMLDivElement>(null);
  // Prevent background scroll on mobile when chat is open
  useEffect(() => {
    if (isMobile && chatOpen.value) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isMobile, chatOpen.value]);

  // Handle dynamic height for keyboard (mobile)
  useEffect(() => {
    if (isMobile && chatOpen.value && containerRef.current) {
      const setHeight = () => {
        if (containerRef.current) {
          containerRef.current.style.height = globalThis.innerHeight + "px";
          containerRef.current.style.width = "100vw";
        }
      };
      setHeight();
      globalThis.addEventListener("resize", setHeight);
      return () => {
        globalThis.removeEventListener("resize", setHeight);
      };
    }
  }, [isMobile, chatOpen.value]);

  // Reset inline styles when leaving mobile mode
  useEffect(() => {
    if (!isMobile && containerRef.current) {
      containerRef.current.style.height = "";
      containerRef.current.style.width = "";
    }
  }, [isMobile, chatOpen.value]);

  return (
    <>
      {isMobile && chatOpen.value && <Overlay />}
      <div
        ref={containerRef}
        style={{
          position: "fixed",
          zIndex: overlayZIndex + 1,
          ...(isMobile && chatOpen.value
            ? {
              inset: 0,
              width: "100vw",
              height: "100dvh",
              maxHeight: "100dvh",
              background: isDark ? "#232526" : "#fff",
              transition: "height 0.2s",
            }
            : { bottom: 24, right: 24 }),
          display: "flex",
          flexDirection: "column",
        }}
      >
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
      </div>
    </>
  );
};
