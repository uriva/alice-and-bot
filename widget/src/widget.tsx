import { useEffect, useState } from "preact/hooks";
import {
  Chat,
  createConversation,
  createIdentity,
  type Credentials,
  useConversations,
} from "../../mod.ts";

const useGetOrCreateConversation = (creds: Credentials, otherSide: string) => {
  const [conversation, setConversation] = useState<string | null>(null);
  const conversations = useConversations(creds);
  useEffect(() => {
    if (conversation) return;
    const existingConversation = conversations.find(({ participants }) =>
      participants.some(({ publicSignKey }) => publicSignKey === otherSide)
    );
    if (existingConversation) {
      setConversation(existingConversation.id);
      return;
    }
    createConversation([creds.publicSignKey, otherSide], "Chat");
  }, [conversation, conversations]);
  return conversation;
};

const useCredentials = (name: string | null) => {
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  useEffect(() => {
    const existingCredentials = localStorage.getItem("aliceAndBotCredentials");
    if (existingCredentials) {
      setCredentials(JSON.parse(existingCredentials));
      return;
    }
    if (!name) return;
    createIdentity(name).then((newCredentials) => {
      setCredentials(newCredentials);
      localStorage.setItem(
        "aliceAndBotCredentials",
        JSON.stringify(newCredentials),
      );
    });
  }, [name]);
  return credentials;
};

export const Widget = ({ dialTo }: { dialTo: string }) => {
  const [chatOpen, setChatOpen] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const credentials = useCredentials(name);
  const conversation = chatOpen && credentials &&
    useGetOrCreateConversation(credentials, dialTo);
  if (chatOpen) {
    if (conversation) {
      return (
        <Chat
          onClose={() => {
            setChatOpen(false);
          }}
          credentials={credentials}
          conversationId={conversation}
        />
      );
    }
    if (credentials) {
      return (
        <div>
          <p>Getting/creating conversation...</p>
        </div>
      );
    }
    return (
      <div>
        <p>Loading credentials...</p>
      </div>
    );
  }

  if (!chatOpen) {
    if (conversation) {
      return (
        <div>
          <button type="button" onClick={() => setChatOpen(true)}>
            Open Chat
          </button>
        </div>
      );
    }
    if (!credentials) {
      return (
        <div>
          <button
            type="button"
            onClick={() => {
              const userName = prompt("Enter your name:");
              if (userName) {
                setName(userName);
                setChatOpen(true);
              } else {
                alert("Name is required to start a chat.");
              }
            }}
          >
            Start Chat
          </button>
        </div>
      );
    }
    return (
      <div>
        <button
          type="button"
          onClick={() => {
            setChatOpen(true);
          }}
        >
          Start Chat
        </button>
      </div>
    );
  }

  return null;
};
