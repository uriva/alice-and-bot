import { signal } from "@preact/signals";
import { coerce } from "gamla";
import { useState } from "preact/hooks";
import {
  useCredentials,
  useDarkMode,
  useIsMobile,
} from "../../clients/react/src/hooks.ts";
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
  { dialTo, credentials }: { dialTo: string; credentials: Credentials },
) => {
  const conversation = useGetOrCreateConversation(credentials, [dialTo]);
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

export const Widget = ({ dialTo }: { dialTo: string }) => {
  const isMobile = useIsMobile();
  const containerPositioning = isMobile
    ? { position: "fixed", inset: 0, zIndex: 10000 }
    : { position: "fixed", bottom: 24, right: 24, zIndex: 10000 };
  const [name, setName] = useState<string | null>(null);
  const isDark = useDarkMode();
  const credentials = useCredentials(name, "aliceAndBotCredentials");
  if (!credentials && !chatOpen.value) {
    return (
      <div style={{ display: "flex", justifyContent: "center" }}>
        <button
          type="button"
          style={getStartButtonStyle(isDark)}
          onClick={() => {
            const userName = prompt("Enter your name:");
            if (userName) {
              setName(userName);
              chatOpen.value = true;
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
    <div style={containerPositioning}>
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
            }}
          >
            Chat
          </button>
        )}
    </div>
  );
};
