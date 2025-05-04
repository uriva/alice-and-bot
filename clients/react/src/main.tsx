import { useCallback, useEffect, useState } from "preact/hooks";
import { init } from "@instantdb/react";
import schema from "../../../instant.schema.ts";
import {
  DecipheredMessage,
  decryptMessage,
  getConversationKey,
  instantAppId,
  sendMessage,
} from "../../../protocol/src/api.ts";
import { map, sideLog } from "gamla";

const { useQuery, queryOnce, transact, tx } = init({
  appId: instantAppId,
  schema,
});

export type Credentials = {
  publicSignKey: string;
  privateSignKey: string;
  privateEncryptKey: string;
};

interface ChatProps {
  credentials: Credentials;
  conversationId: string;
  userInstantToken: string;
}

export const Chat = ({
  credentials,
  conversationId,
  userInstantToken,
}: ChatProps) => {
  const [conversationKey, setConversationKey] = useState<string | null>(null);
  const [messages, setMessages] = useState<DecipheredMessage[]>([]);
  const [input, setInput] = useState("");
  const { data, isLoading, error } = useQuery({
    messages: {
      conversation: {},
      $: {
        where: { conversation: conversationId },
        // orderBy: { timestamp: "asc" },
      },
    },
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {sideLog(error).message}</div>;
  const { messages: encryptedMessages } = data;

  // Fetch conversation symmetric key
  useEffect(() => {
    getConversationKey(
      { queryOnce },
      conversationId,
      credentials.publicSignKey,
      credentials.privateEncryptKey,
    ).then(setConversationKey);
  }, [queryOnce, conversationId, credentials]);

  // Decrypt messages when data or key changes
  useEffect(() => {
    if (!conversationKey) return;
    map(decryptMessage(conversationKey))(encryptedMessages).then(setMessages);
  }, [conversationKey, data]);

  // Send a new message
  const handleSend = useCallback(async () => {
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
  ]);

  return (
    <div style={{ border: "1px solid #ccc", padding: 16, maxWidth: 400 }}>
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
        onKeyDown={(e) => e.key === "Enter" && handleSend()}
        placeholder="Type a message..."
        style={{ width: "80%" }}
      />
      <button
        type="button"
        onClick={handleSend}
        style={{ width: "18%", marginLeft: 4 }}
      >
        Send
      </button>
    </div>
  );
};
