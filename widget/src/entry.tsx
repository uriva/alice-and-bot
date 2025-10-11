import { render } from "preact";
import { useState } from "preact/hooks";
import { useCredentials } from "../../clients/react/src/hooks.ts";
import { Widget } from "./widget.tsx";
import { toast, Toaster } from "react-hot-toast";

const elementId = "alice-and-bot-widget-root";

const Entry = (
  { dialTo, initialMessage, startOpen }: {
    dialTo: string;
    initialMessage?: string;
    startOpen?: boolean;
  },
) => {
  const [name, setName] = useState<string | null>(null);
  const credentials = useCredentials(name, "aliceAndBotCredentials");
  return (
    <>
      <Toaster />
      <Widget
        dialTo={[dialTo]}
        initialMessage={initialMessage}
        startOpen={startOpen}
        onNameChosen={(userName) => {
          if (credentials) return;
          const trimmed = userName.trim();
          if (!trimmed) {
            toast.error("Name is required to start a chat");
            return;
          }
          setName(trimmed);
          toast.success("Welcome, " + trimmed);
        }}
        credentials={credentials}
      />
    </>
  );
};

export const loadChatWidget = (
  { dialingTo, initialMessage, startOpen }: {
    dialingTo: string;
    initialMessage?: string;
    startOpen?: boolean;
  },
) => {
  const existing = document.getElementById(elementId);
  if (existing) return;
  const div = document.createElement("div");
  div.id = elementId;
  document.body.appendChild(div);
  render(
    <Entry
      dialTo={dialingTo}
      initialMessage={initialMessage}
      startOpen={startOpen}
    />,
    div,
  );
};
