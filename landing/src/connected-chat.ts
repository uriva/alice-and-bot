import type { Credentials } from "../../protocol/src/clientApi.ts";
import type { CustomColors } from "../../lit/components/types.ts";
import "../../lit/components/connected-chat.ts";

type ChatProps = {
  credentials: Credentials;
  conversationId: string;
  onClose?: () => void;
  darkModeOverride?: boolean;
  customColors?: CustomColors;
  enableAttachments?: boolean;
  enableAudioRecording?: boolean;
};

const containerStyle =
  "display:flex;flex-direction:column;flex-grow:1;min-height:0";

const filterDefined = (obj: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

export const connectedChat = (
  {
    credentials,
    conversationId,
    onClose,
    darkModeOverride,
    customColors,
    enableAttachments,
    enableAudioRecording,
  }: ChatProps,
  container: HTMLElement,
) => {
  const el = document.createElement("alice-connected-chat");
  Object.assign(
    el,
    filterDefined({
      credentials,
      conversationId,
      onClose,
      darkModeOverride,
      customColors,
      enableAttachments,
      enableAudioRecording,
    }),
  );
  el.setAttribute("style", containerStyle);
  container.innerHTML = "";
  container.style.cssText = containerStyle;
  container.appendChild(el);
};

export const updateConnectedChat = (
  el: HTMLElement,
  props: Partial<ChatProps>,
) => Object.assign(el, props);
