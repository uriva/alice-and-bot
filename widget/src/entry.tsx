import { Widget } from "./widget.tsx";
import { render } from "preact";

const elementId = "alice-and-bot-widget-root";

export const loadChatWidget = (options: { dialingTo: string }) => {
  const existing = document.getElementById(elementId);
  if (existing) return;
  const div = document.createElement("div");
  div.id = elementId;
  document.body.appendChild(div);
  render(<Widget dialTo={options.dialingTo} />, div);
};
