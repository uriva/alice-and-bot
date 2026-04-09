import { createWidget, type WidgetParams } from "./widget.ts";

const elementId = "alice-and-bot-widget-root";

export const loadChatWidget = (params: WidgetParams) => {
  if (document.getElementById(elementId)) return;
  const root = document.createElement("div");
  root.id = elementId;
  document.body.appendChild(root);
  const { element } = createWidget(params);
  root.appendChild(element);
};
