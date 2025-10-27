import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { toast, Toaster } from "react-hot-toast";
import { useCredentials } from "../../clients/react/src/hooks.ts";
import { Widget, type WidgetParams } from "./widget.tsx";

const elementId = "alice-and-bot-widget-root";

const Entry = (params: WidgetParams) => {
  const [name, setName] = useState<string | null>(null);
  const credentials = useCredentials(name, "aliceAndBotCredentials");
  useEffect(() => {
    if (params.defaultName) setName(params.defaultName);
  }, [params.defaultName]);
  return (
    <>
      <Toaster />
      <Widget
        onNameChosen={params.defaultName ? () => {} : (userName) => {
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
        {...params}
      />
    </>
  );
};

export const loadChatWidget = (params: WidgetParams) => {
  if (document.getElementById(elementId)) return;
  const div = document.createElement("div");
  div.id = elementId;
  document.body.appendChild(div);
  render(<Entry {...params} />, div);
};
