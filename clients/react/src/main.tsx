import { init } from "@instantdb/react";
import { logAround, logBefore, map, pipe, sideLog } from "gamla";
import { useCallback, useEffect, useState } from "preact/hooks";
import schema from "../../../instant.schema.ts";
import {
  DecipheredMessage,
  decryptMessage,
  instantAppId,
  sendMessage,
  useConversationKey,
} from "../../../protocol/src/api.ts";

const { useQuery, transact, tx } = init({
  appId: instantAppId,
  schema,
});

export type Credentials = {
  publicSignKey: string;
  privateSignKey: string;
  privateEncryptKey: string;
};

type ChatProps = {
  credentials: Credentials;
  conversationId: string;
  userInstantToken: string;
};

export const Chat = ({
  credentials,
  conversationId,
  userInstantToken,
}: ChatProps) => {
  const [messages, setMessages] = useState<DecipheredMessage[]>([]);
  const [input, setInput] = useState("");
  const { data } = useQuery({
    messages: {
      conversation: {},
      $: {
        where: { conversation: conversationId },
        orderBy: { timestamp: "desc" },
      },
    },
  });
  const conversationKey = useConversationKey(
    { useQuery },
    conversationId,
    credentials.publicSignKey,
    credentials.privateEncryptKey,
  );
  const encryptedMessages = data?.messages ?? [];
  useEffect(() => {
    if (!conversationKey) return;
    pipe(map(decryptMessage(conversationKey)), setMessages)(encryptedMessages);
  }, [conversationKey, encryptedMessages]);
  return (
    <div style={{ border: "1px solid #ccc", padding: 16, maxWidth: 400 }}>
      {conversationId}
      <div style={{ minHeight: 200, marginBottom: 8 }}>
        {messages.map((msg, i) => (
          <div key={i}>
            <b>{msg.publicSignKey.slice(0, 8)}:</b> {msg.text}
            <span style={{ color: "#888", fontSize: 10, marginLeft: 8 }}>
              {new Date(msg.timestamp).toLocaleTimeString()}
            </span>
          </div>
        ))}
      </div>
      <input
        value={input}
        onChange={(e) => setInput(e.currentTarget.value)}
        onKeyDown={(e) =>
          e.key === "Enter" && useCallback(async () => {
            if (!conversationKey || !input.trim()) return;
            await sendMessage(
              { transact, tx },
              conversationKey,
              credentials.publicSignKey,
              credentials.privateSignKey,
              { type: "text", text: input },
              conversationId,
              userInstantToken,
            );
            setInput("");
          }, [
            transact,
            tx,
            conversationKey,
            input,
            credentials,
            conversationId,
            userInstantToken,
          ])()}
        placeholder="Type a message..."
        style={{ width: "80%" }}
      />
      {!conversationKey && (
        <div style={{ color: "red", fontSize: 12 }}>
          Waiting for conversation key...
        </div>
      )}
      <button
        type="button"
        disabled={!input.trim() || !conversationKey}
        onClick={async () => {
          if (!conversationKey || !input.trim()) return;
          await sendMessage(
            { transact, tx },
            conversationKey,
            credentials.publicSignKey,
            credentials.privateSignKey,
            { type: "text", text: input },
            conversationId,
            userInstantToken,
          );
          setInput("");
        }}
        style={{ width: "18%", marginLeft: 4 }}
      >
        Send
      </button>
    </div>
  );
};
