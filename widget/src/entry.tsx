import { render } from "preact";
import { useState } from "preact/hooks";
import { useCredentials } from "../../clients/react/src/hooks.ts";
import { Widget } from "./widget.tsx";

const elementId = "alice-and-bot-widget-root";

const Entry = ({ dialTo }: { dialTo: string }) => {
  const [name, setName] = useState<string | null>(null);
  const credentials = useCredentials(name, "aliceAndBotCredentials");
  return (
    <Widget
      dialTo={[dialTo]}
      generateCredentials={() => {
        if (credentials) return;
        const userName = prompt("Enter your name:");
        if (userName) {
          setName(userName);
        } else {
          alert("Name is required to start a chat.");
        }
      }}
      credentials={credentials}
    />
  );
};

export const loadChatWidget = ({ dialingTo }: { dialingTo: string }) => {
  const existing = document.getElementById(elementId);
  if (existing) return;
  const div = document.createElement("div");
  div.id = elementId;
  document.body.appendChild(div);
  render(<Entry dialTo={dialingTo} />, div);
};
