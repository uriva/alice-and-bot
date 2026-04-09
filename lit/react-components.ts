import { createComponent, type ReactWebComponent } from "@lit/react";
import React from "react";
import { ConnectedChat as ConnectedChatElement } from "./components/connected-chat.ts";
import { ChatBox as ChatBoxElement } from "./components/chat-box.ts";
import type { Credentials } from "../protocol/src/clientApi.ts";
import {
  createWidget,
  type WidgetColorScheme,
  type WidgetParams,
} from "../widget/src/widget.ts";
import { saveCredentials } from "./core/credentials.ts";

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

type WidgetProps = {
  credentials: Credentials | null;
  onNameChosen?: (name: string) => void;
  participants: string[];
  initialMessage?: string;
  startOpen?: boolean;
  buttonText?: string;
  defaultName?: string;
  colorScheme?: WidgetColorScheme;
  enableVoiceCall?: boolean;
};

export const Widget = ({
  credentials,
  participants,
  initialMessage,
  startOpen,
  buttonText,
  defaultName,
  colorScheme,
  enableVoiceCall,
}: WidgetProps): null => {
  const destroyRef = React.useRef<(() => void) | null>(null);

  React.useEffect(() => {
    if (credentials) saveCredentials("aliceAndBotCredentials", credentials);
    const params: WidgetParams = {
      participants,
      ...(initialMessage !== undefined && { initialMessage }),
      ...(startOpen !== undefined && { startOpen }),
      ...(buttonText !== undefined && { buttonText }),
      ...(defaultName !== undefined && { defaultName }),
      ...(colorScheme !== undefined && { colorScheme }),
      ...(enableVoiceCall !== undefined && { enableVoiceCall }),
    };
    const { element, destroy } = createWidget(params);
    document.body.appendChild(element);
    destroyRef.current = () => {
      destroy();
      element.remove();
    };
    return () => {
      destroyRef.current?.();
      destroyRef.current = null;
    };
  }, []);

  return null;
};
