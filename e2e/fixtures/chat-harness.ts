/// <reference lib="dom" />
import { coerce } from "@uri/gamla";
import { ConnectedChat } from "../../lit/components/connected-chat.ts";

declare global {
  interface Window {
    __TEST_CREDENTIALS__?: {
      publicSignKey: string;
      privateSignKey: string;
      privateEncryptKey: string;
    };
    __TEST_CONVERSATION_ID__?: string;
  }
}

const creds = globalThis.window.__TEST_CREDENTIALS__;
const conversationId = globalThis.window.__TEST_CONVERSATION_ID__;

const root = coerce(document.getElementById("root"));
root.style.height = "100vh";
root.style.width = "100%";
root.style.display = "flex";
root.style.flexDirection = "column";

if (!creds || !conversationId) {
  const err = document.createElement("div");
  err.id = "harness-error";
  err.textContent = "Missing test credentials";
  root.appendChild(err);
} else {
  const chat = new ConnectedChat();
  chat.credentials = creds;
  chat.conversationId = conversationId;
  chat.darkModeOverride = true;
  root.appendChild(chat);
}
