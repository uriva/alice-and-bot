import { init } from "@instantdb/react";
import { signal } from "@preact/signals";
import { useEffect, useState } from "preact/hooks";
import { useLocation } from "preact-iso";
import { useConversations } from "../..//clients/react/src/hooks.ts";
import { Chat as ChatNoDb } from "../../clients/react/src/main.tsx";
import schema from "../../instant.schema.ts";
import {
  createConversation,
  createIdentity,
  type Credentials,
  instantAppId,
} from "../../protocol/src/api.ts";
import { PublicKey } from "./components.tsx";

const db = init({ appId: instantAppId, schema });

const nameFromPublicSignKey = async (publicSignKey: string) => {
  const { data } = await db.queryOnce({
    identities: { $: { where: { publicSignKey } } },
  });
  if (data.identities.length === 0) {
    console.error(
      `No identity found for public sign key: ${publicSignKey}`,
    );
    return publicSignKey;
  }
  return data.identities[0].name ?? publicSignKey;
};

const selectedConversation = signal<string | null>(null);

const Chat = ChatNoDb(() => db);

const startConversation =
  (credentials: Credentials, publicSignKey: string) => async () => {
    const title = `${await nameFromPublicSignKey(
      credentials.publicSignKey,
    )} & ${await nameFromPublicSignKey(publicSignKey)}`;
    await createConversation(() => db)(
      [publicSignKey, credentials.publicSignKey],
      title,
    ).then((response) => {
      if (!("conversationId" in response)) {
        alert("Failed to create conversation");
        return;
      }
      selectedConversation.value = response.conversationId;
    });
  };

// NewUserForm component
const NewUserForm = ({ onCreated, storeInBrowser, setStoreInBrowser }: {
  onCreated: (creds: Credentials, credsString: string) => void;
  storeInBrowser: boolean;
  setStoreInBrowser: (v: boolean) => void;
}) => {
  const [identityName, setIdentityName] = useState("");
  const [credentialsString, setCredentialsString] = useState<string | null>(
    null,
  );

  const onClickCreateIdentity = async () => {
    if (!identityName.trim()) {
      alert("Please enter a name for your identity.");
      return;
    }
    const creds = await createIdentity(identityName);
    const credsStr = JSON.stringify(creds);
    setCredentialsString(credsStr);
    onCreated(creds, credsStr);
    if (storeInBrowser) {
      try {
        localStorage.setItem("alicebot_credentials", credsStr);
      } catch (_e) { /* ignore */ }
    }
  };

  return (
    <div class={sectionSpacing}>
      <label class={labelStyle}>Create a new identity</label>
      <div class={inputRowStyle}>
        <input
          class={inputStyle}
          placeholder="Enter your name"
          value={identityName}
          onInput={(e) => setIdentityName(e.currentTarget.value)}
        />
        <button
          type="button"
          class={buttonBlueStyle}
          onClick={onClickCreateIdentity}
        >
          Sign up
        </button>
      </div>
      <div class="flex items-center mb-2">
        <input
          id="storeInBrowser"
          type="checkbox"
          checked={storeInBrowser}
          onChange={(e) => setStoreInBrowser(e.currentTarget.checked)}
          class="mr-2"
        />
        <label for="storeInBrowser" class={labelSmallStyle}>
          Store credentials in this browser (recommended)
        </label>
      </div>
      {credentialsString && (
        <div class="mt-2">
          <label class={labelSmallStyle}>
            Save your credentials string:
          </label>
          <textarea
            class={textareaStyle}
            value={credentialsString}
            readOnly
            rows={3}
          />
          <div class={hintStyle}>
            Copy and save this string to identify as this user later.
          </div>
        </div>
      )}
    </div>
  );
};

// ExistingUserForm component
const ExistingUserForm = ({ onIdentified, storeInBrowser, setStoreInBrowser }: {
  onIdentified: (creds: Credentials) => void;
  storeInBrowser: boolean;
  setStoreInBrowser: (v: boolean) => void;
}) => {
  const [inputCredentials, setInputCredentials] = useState("");

  const identify = () => {
    try {
      const creds = JSON.parse(inputCredentials);
      onIdentified(creds);
      if (storeInBrowser) {
        try {
          localStorage.setItem("alicebot_credentials", inputCredentials);
        } catch (_e) { /* ignore */ }
      }
    } catch {
      alert("Invalid credentials string");
    }
  };

  return (
    <div class={sectionSpacing}>
      <label class={labelStyle}>
        Paste your credentials string
      </label>
      <div class={inputRowStyle}>
        <input
          class={inputStyle}
          placeholder="Paste credentials string here"
          value={inputCredentials}
          onInput={(e) => setInputCredentials(e.currentTarget.value)}
        />
        <button
          type="button"
          class={buttonBlueStyle}
          onClick={identify}
        >
          Sign in
        </button>
      </div>
      <div class="flex items-center mt-1">
        <input
          id="storeInBrowser2"
          type="checkbox"
          checked={storeInBrowser}
          onChange={(e) => setStoreInBrowser(e.currentTarget.checked)}
          class="mr-2"
        />
        <label for="storeInBrowser2" class={labelSmallStyle}>
          Store credentials in this browser (recommended)
        </label>
      </div>
    </div>
  );
};

export const ChatDemo = () => {
  const location = useLocation();
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [storeInBrowser, setStoreInBrowser] = useState(true);
  const [showForm, setShowForm] = useState<null | "new" | "existing">(null);
  const conversations = useConversations(() => db)(
    credentials?.publicSignKey ?? "",
  );
  const [otherParticipantPublicKey, setOtherParticipantPublicKey] = useState(
    "",
  );

  // Store chatWith param if present
  const [pendingChatWith, setPendingChatWith] = useState<string | null>(null);

  // On mount, check for stored credentials and chatWith param
  useEffect(() => {
    try {
      const stored = localStorage.getItem("alicebot_credentials");
      if (stored) {
        const creds = JSON.parse(stored);
        setCredentials(creds);
      }
    } catch (_e) { /* ignore */ }
  }, []);

  // Watch for chatWith param changes
  useEffect(() => {
    const params = new URLSearchParams(location.query || "");
    const chatWith = params.get("chatWith");
    if (chatWith) {
      setPendingChatWith(chatWith);
    }
  }, [location.query]);

  // After login, if chatWith param is present, focus or create conversation
  useEffect(() => {
    if (!credentials || !pendingChatWith) return;
    // Check if conversation exists
    const existing = conversations.find((conv) => {
      if (!conv.participants) return false;
      // participants can be array of string or objects with publicSignKey
      return conv.participants.some((p: string | { publicSignKey: string }) =>
        typeof p === "string"
          ? p === pendingChatWith
          : p?.publicSignKey === pendingChatWith
      );
    });
    if (existing) {
      selectedConversation.value = existing.id;
      setPendingChatWith(null);
    } else {
      // Create conversation and focus
      (async () => {
        await startConversation(credentials, pendingChatWith)();
        setPendingChatWith(null);
      })();
    }
  }, [credentials, pendingChatWith, conversations]);

  return (
    <section class="my-8 p-6 bg-gray-50 dark:bg-gray-800 rounded-lg shadow dark:shadow-blue-900/20 w-full max-w-2xl mx-auto">
      <h2 class="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">
        Alice&Bot encrypted chat
      </h2>
      {!credentials && (
        <div>
          {showForm === null && (
            <div class="flex flex-col gap-4 mb-6">
              <button
                type="button"
                class={buttonBlueStyle}
                onClick={() => setShowForm("new")}
              >
                I'm a new user
              </button>
              <button
                type="button"
                class={buttonBlueStyle}
                onClick={() => setShowForm("existing")}
              >
                I already have an Alice&Bot identity
              </button>
            </div>
          )}
          {showForm === "new" && (
            <NewUserForm
              onCreated={(creds, _credsStr) => {
                setCredentials(creds);
              }}
              storeInBrowser={storeInBrowser}
              setStoreInBrowser={setStoreInBrowser}
            />
          )}
          {showForm === "existing" && (
            <ExistingUserForm
              onIdentified={(creds) => setCredentials(creds)}
              storeInBrowser={storeInBrowser}
              setStoreInBrowser={setStoreInBrowser}
            />
          )}
        </div>
      )}

      {credentials && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            style={{ display: "flex", flexDirection: "column", gap: 8 }}
            class="text-gray-900 dark:text-gray-100 mb-2"
          >
            <div>
              Your public key is{" "}
              <PublicKey pubkey={credentials.publicSignKey} />
            </div>
            <div>
              You can share it with others to start a conversation. It's like a
              phone number, but for secure messaging.
            </div>
            <div class="mt-2">
              <label class={labelSmallStyle}>Share a chat-with-me link:</label>
              <div class="flex items-center gap-2">
                <input
                  class={inputStyle}
                  readOnly
                  value={`${globalThis.location.origin}${globalThis.location.pathname}?chatWith=${credentials.publicSignKey}`}
                  style={{ maxWidth: "100%" }}
                  onFocus={(e) => e.currentTarget.select()}
                />
              </div>
              <div class={hintStyle}>
                Send this link to someone so they can start a chat with you.
              </div>
            </div>
          </div>
          <div
            style={{ display: "flex", flexDirection: "column", gap: 8 }}
            class={inputRowStyle + " mb-4"}
          >
            <input
              class={inputStyle}
              placeholder="Recipient public key"
              onInput={(e) => {
                setOtherParticipantPublicKey(e.currentTarget.value);
              }}
            />
            <button
              type="button"
              class={buttonGreenStyle}
              onClick={startConversation(
                credentials,
                otherParticipantPublicKey,
              )}
            >
              Start New Conversation
            </button>
          </div>
          <div class="mb-4">
            <h3 class={labelStyle + " mb-2"}>Open Chats</h3>
            {conversations.length === 0
              ? <div class={emptyStyle}>No conversations yet.</div>
              : (
                <ul class="flex gap-2 flex-wrap">
                  {conversations.map((conv) => (
                    <li key={conv.id}>
                      <button
                        type="button"
                        class={chatButtonStyle +
                          (selectedConversation.value === conv.id
                            ? " " + chatButtonActiveStyle
                            : "")}
                        onClick={() => {
                          selectedConversation.value = conv.id;
                        }}
                      >
                        {conv.title || conv.id}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
          </div>
          {selectedConversation.value && (
            <div class="mt-6 overflow-x-auto">
              <Chat
                credentials={credentials}
                conversationId={selectedConversation.value}
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
};

const sectionSpacing = "mb-6";
const labelStyle =
  "block mb-2 text-sm font-medium text-gray-900 dark:text-gray-300";
const labelSmallStyle = "block text-xs text-gray-700 dark:text-gray-400";
const inputRowStyle = "flex gap-2 mb-2";
const inputStyle =
  "border px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-500 dark:focus:border-blue-500 w-full";
const buttonBaseStyle =
  "px-4 py-2 text-white rounded-lg focus:ring-4 focus:outline-none whitespace-nowrap";
const buttonBlueStyle =
  `${buttonBaseStyle} bg-blue-600 hover:bg-blue-700 focus:ring-blue-300 dark:bg-blue-500 dark:hover:bg-blue-600 dark:focus:ring-blue-800`;
const buttonGreenStyle =
  `${buttonBaseStyle} bg-green-600 hover:bg-green-700 focus:ring-green-300 dark:bg-green-500 dark:hover:bg-green-600 dark:focus:ring-green-800`;
const textareaStyle =
  "w-full border rounded-lg p-2.5 text-sm bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white";
const hintStyle = "text-xs text-gray-600 dark:text-gray-400 mt-1";
const emptyStyle = "text-gray-600 dark:text-gray-400 text-sm";
const chatButtonStyle =
  "px-3 py-2 rounded-lg border transition-colors w-full sm:w-auto mt-1 sm:mt-0 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700";
const chatButtonActiveStyle =
  "bg-blue-100 dark:bg-blue-700 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-500";
