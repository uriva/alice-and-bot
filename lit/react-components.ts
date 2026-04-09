import { createComponent, type ReactWebComponent } from "@lit/react";
import React from "react";
import { ConnectedChat as ConnectedChatElement } from "./components/connected-chat.ts";
import { ChatBox as ChatBoxElement } from "./components/chat-box.ts";

export const Chat: ReactWebComponent<ConnectedChatElement> = createComponent({
  tagName: "alice-connected-chat",
  elementClass: ConnectedChatElement,
  react: React,
});

export const AbstractChatBox: ReactWebComponent<ChatBoxElement> =
  createComponent({
    tagName: "chat-box",
    elementClass: ChatBoxElement,
    react: React,
  });
