import { coerce } from "gamla";
import { useState } from "preact/hooks";
import {
  useCredentials,
  useDarkMode,
  useIsMobile,
} from "../../clients/react/src/hooks.ts";
import { Chat, useGetOrCreateConversation } from "../../mod.ts";

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

const InternalWidget = ({ dialTo }: { dialTo: string }) => {
  const [chatOpen, setChatOpen] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const credentials = useCredentials(name, "aliceAndBotCredentials");
  const conversation = useGetOrCreateConversation(credentials, dialTo);
  const isDark = useDarkMode();

  if (chatOpen) {
    if (conversation) {
      return (
        <Chat
          onClose={() => {
            setChatOpen(false);
          }}
          credentials={coerce(credentials)}
          conversationId={conversation}
        />
      );
    }
    if (credentials) {
      return (
        <div>
          <p>Getting/creating conversation...</p>
        </div>
      );
    }
    return (
      <div>
        <p>Loading credentials...</p>
      </div>
    );
  }

  if (!chatOpen) {
    if (conversation) {
      return (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <button
            type="button"
            style={getStartButtonStyle(isDark)}
            onClick={() => setChatOpen(true)}
          >
            Open Chat
          </button>
        </div>
      );
    }
    if (!credentials) {
      return (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <button
            type="button"
            style={getStartButtonStyle(isDark)}
            onClick={() => {
              const userName = prompt("Enter your name:");
              if (userName) {
                setName(userName);
                setChatOpen(true);
              } else {
                alert("Name is required to start a chat.");
              }
            }}
          >
            Start Chat
          </button>
        </div>
      );
    }
    return (
      <div style={{ display: "flex", justifyContent: "center" }}>
        <button
          style={getStartButtonStyle(isDark)}
          type="button"
          onClick={() => {
            setChatOpen(true);
          }}
        >
          Start Chat
        </button>
      </div>
    );
  }

  return null;
};

export const Widget = ({ dialTo }: { dialTo: string }) => {
  const isMobile = useIsMobile();
  return (
    <div
      style={isMobile
        ? { position: "fixed", inset: 0, zIndex: 10000 }
        : { position: "fixed", bottom: 24, right: 24, zIndex: 10000 }}
    >
      <InternalWidget dialTo={dialTo} />
    </div>
  );
};
