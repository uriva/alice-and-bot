import { render } from "preact";
import { Chat } from "../../mod.ts";

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

const containerStyle: Record<string, string> = {
  height: "100vh",
  width: "100%",
  display: "flex",
  flexDirection: "column",
};

const Harness = () => {
  const creds = globalThis.window.__TEST_CREDENTIALS__;
  const conversationId = globalThis.window.__TEST_CONVERSATION_ID__;
  if (!creds || !conversationId) return <div id="harness-error">Missing test credentials</div>;
  return (
    <div style={containerStyle}>
      <Chat credentials={creds} conversationId={conversationId} darkModeOverride />
    </div>
  );
};

render(<Harness />, document.getElementById("root")!);
