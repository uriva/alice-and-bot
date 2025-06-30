import { init } from "@instantdb/react";
import { effect, signal } from "@preact/signals";
import { useLocation } from "preact-iso";
import { useEffect, useState } from "preact/hooks";
import {
  type Conversation,
  useConversations,
  useDarkMode,
  useUserName,
} from "../..//clients/react/src/hooks.ts";
import { ChatAvatar } from "../../clients/react/src/abstractChatBox.tsx";
import { stringToColor } from "../../clients/react/src/design.tsx";
import { Chat as ChatNoDb } from "../../clients/react/src/main.tsx";
import schema from "../../instant.schema.ts";
import {
  chatWithMeLink,
  createConversation,
  createIdentity,
  type Credentials,
  instantAppId,
} from "../../protocol/src/api.ts";
import { CopyableString } from "./components.tsx";
import { chatPath } from "./paths.ts";

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

const startConversation = async (
  credentials: Credentials,
  publicSignKey: string,
) =>
  createConversation(() => db)(
    [publicSignKey, credentials.publicSignKey],
    `${await nameFromPublicSignKey(
      credentials.publicSignKey,
    )} & ${await nameFromPublicSignKey(publicSignKey)}`,
  ).then((response) => {
    if (!("conversationId" in response)) {
      alert("Failed to create conversation");
      return;
    }
    selectedConversation.value = response.conversationId;
  });

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

const YourKey = ({ publicSignKey }: { publicSignKey: string }) => {
  const name = useUserName(() => db)(publicSignKey);
  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
      class={`${textColorStyle} mb-2`}
    >
      <div>
        Your public name: {name ?? "loading..."}
      </div>
      <div>
        Your user id is <CopyableString str={publicSignKey} />
      </div>
      <div>
        Invite others to chat with you:&nbsp;
        <CopyableString
          str={chatWithMeLink(publicSignKey)}
        />
      </div>
      <CopyCredentialsButton />
      <DeleteCredentialsButton />
    </div>
  );
};

const ConversationListItem = (
  { conv, credentials }: { conv: Conversation; credentials: Credentials },
) => {
  const otherParticipant = conv.participants.find((p) =>
    p.publicSignKey !== credentials.publicSignKey
  );
  const name = useUserName(() => db)(otherParticipant?.publicSignKey ?? "");
  const isDarkMode = useDarkMode();
  return (
    <li key={conv.id}>
      <button
        type="button"
        class={`w-full text-left p-2 rounded-lg flex items-center gap-3 ${
          selectedConversation.value === conv.id
            ? "bg-blue-100 dark:bg-blue-700"
            : "hover:bg-gray-100 dark:hover:bg-gray-700"
        }`}
        onClick={() => {
          selectedConversation.value = conv.id;
        }}
      >
        <ChatAvatar
          name={name}
          baseColor={stringToColor(
            otherParticipant?.publicSignKey ?? "",
            isDarkMode,
          )}
        />
        <div class="flex-grow overflow-hidden">
          <div class={`font-semibold ${textColorStyle}`}>{name ?? "..."}</div>
        </div>
      </button>
    </li>
  );
};

const OpenChats = (
  { credentials, setView }: {
    credentials: Credentials | null;
    setView: (view: View) => void;
  },
) => {
  const conversations = useConversations(() => db)(
    credentials?.publicSignKey ?? "",
  ) ?? [];
  return (
    <div style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>
      {conversations.length === 0
        ? (
          <div style={{ display: "flex", flexGrow: 1 }} class={emptyStyle}>
            <div>No chats yet.</div>
            <button
              type="button"
              class={buttonBlueStyle + " mt-4"}
              onClick={() => setView("new_chat")}
            >
              Start a new chat
            </button>
          </div>
        )
        : (
          <ul class="flex flex-col gap-1">
            {conversations.map((conv) => (
              <ConversationListItem
                key={conv.id}
                conv={conv}
                credentials={credentials!}
              />
            ))}
          </ul>
        )}
    </div>
  );
};

const Nav = (
  { view, setView }: { view: View; setView: (view: View) => void },
) => {
  const buttonClass = (buttonView: View) =>
    `px-3 py-2 rounded-md text-sm font-medium ${
      view === buttonView
        ? "bg-gray-900 text-white"
        : "text-gray-700 hover:bg-gray-200"
    }`;

  return (
    <nav class="flex space-x-4 mb-4">
      <button
        type="button"
        class={buttonClass("chats")}
        onClick={() => setView("chats")}
      >
        Open Chats
      </button>
      <button
        type="button"
        class={buttonClass("new_chat")}
        onClick={() => setView("new_chat")}
      >
        New chat
      </button>
      <button
        type="button"
        class={buttonClass("identity")}
        onClick={() => setView("identity")}
      >
        Identity
      </button>
    </nav>
  );
};

const NewChatScreen = (
  { credentials }: { credentials: Credentials },
) => {
  const [otherParticipantPubKey, setOtherParticipantPubKey] = useState("");
  return (
    <div class="h-full">
      <div
        style={{ display: "flex", flexDirection: "column", gap: 8 }}
        class={inputRowStyle + " mb-4"}
      >
        <input
          class={inputStyle}
          placeholder="Recipient public key"
          value={otherParticipantPubKey}
          onInput={(e) => {
            setOtherParticipantPubKey(e.currentTarget.value);
          }}
        />
        <div>
          <button
            type="button"
            class={buttonGreenStyle}
            onClick={() =>
              startConversation(
                credentials,
                otherParticipantPubKey,
              )}
          >
            Start New Conversation
          </button>
        </div>
      </div>
    </div>
  );
};

const isMatch =
  (myKey: string, chatWithKey: string) => ({ participants }: Conversation) => {
    const keys = participants.map(({ publicSignKey }) => publicSignKey);
    return (keys.length === 2 && keys.includes(myKey) &&
      keys.includes(chatWithKey));
  };

type View = "chats" | "new_chat" | "identity";

export const Messenger = () => {
  const location = useLocation();
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [storeInBrowser, setStoreInBrowser] = useState(true);
  const [showForm, setShowForm] = useState<null | "new" | "existing">(null);
  const conversations = useConversations(() => db)(
    credentials?.publicSignKey ?? "",
  );
  const [view, setView] = useState<View>("chats");
  effect(() => {
    if (selectedConversation.value) setView("chats");
  });
  useEffect(() => {
    try {
      const stored = localStorage.getItem("alicebot_credentials");
      if (stored) setCredentials(JSON.parse(stored));
    } catch (e) {
      console.error("Failed to parse stored credentials", e);
    }
  }, []);
  const chatWith = location.query["chatWith"];
  const route = useLocation().route;
  useEffect(() => {
    if (!credentials || !conversations || !chatWith) return;
    route(chatPath, true);
    const existing = conversations.find(
      isMatch(credentials.publicSignKey, chatWith),
    );
    if (existing) {
      selectedConversation.value = existing.id;
    } else {
      startConversation(credentials, chatWith);
    }
  }, [credentials, chatWith, conversations]);
  return (
    <div class={`p-4 flex flex-col h-screen ${textColorStyle}`}>
      <div class="mb-4">
        <div class="text-xl font-bold ">👧🤖 Alice&Bot</div>
        <div>
          encrypted chat for AI era
        </div>
      </div>
      {!credentials && (
        <div class="flex flex-col flex-grow justify-center">
          {showForm === null && (
            <div class="flex flex-col items-center gap-4 mb-6">
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
        <div style={{ display: "flex", flexGrow: 1, flexDirection: "column" }}>
          <Nav
            view={view}
            setView={(view: View) => {
              selectedConversation.value = null;
              setView(view);
            }}
          />
          <div
            style={{ display: "flex", flexGrow: 1, flexDirection: "column" }}
          >
            {view === "chats" &&
              (selectedConversation.value
                ? (
                  <Chat
                    credentials={credentials}
                    conversationId={selectedConversation.value}
                  />
                )
                : <OpenChats credentials={credentials} setView={setView} />)}
            {view === "new_chat" && <NewChatScreen credentials={credentials} />}
            {view === "identity" && (
              <YourKey publicSignKey={credentials.publicSignKey} />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const CopyCredentialsButton = () => {
  const [copied, setCopied] = useState(false);
  return (
    <div class="mb-4">
      <button
        type="button"
        class={buttonBlueStyle}
        onClick={() => {
          const creds = localStorage.getItem("alicebot_credentials");
          if (creds) {
            navigator.clipboard.writeText(creds);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }
        }}
      >
        Copy secret credentials{" "}
        {copied && <span class="text-sm ml-1">Copied!</span>}
      </button>
      <div class={hintStyle}>
        Warning: Never share your credentials. Anyone with them has access to
        all your chats forever.
      </div>
    </div>
  );
};

const DeleteCredentialsButton = () => (
  <div class="mb-4">
    <button
      type="button"
      class={buttonRedStyle}
      onClick={() => {
        if (
          confirm(
            "Are you sure? If you delete your credentials from this browser, you will lose access unless you have saved them elsewhere.",
          )
        ) {
          localStorage.removeItem("alicebot_credentials");
          globalThis.location.reload();
        }
      }}
    >
      Delete credentials and sign out
    </button>
    <div class={hintStyle}>
      Warning: Your key is not stored anywhere else. If you delete it and
      haven't saved it, you will lose access to your identity.
    </div>
  </div>
);

const textColorStyle = "text-gray-900 dark:text-gray-100";
const sectionSpacing = "mb-6";
const labelStyle =
  "block mb-2 text-sm font-medium text-gray-900 dark:text-gray-300";
const labelSmallStyle = "block text-xs text-gray-700 dark:text-gray-400";
const inputRowStyle = "flex gap-2 mb-2";
const inputStyle =
  "border px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-500 dark:focus:border-blue-500 max-w-md";
const buttonBaseStyle =
  "px-4 py-2 text-white rounded-lg focus:ring-4 focus:outline-none whitespace-nowrap";
const buttonBlueStyle =
  `${buttonBaseStyle} bg-blue-600 hover:bg-blue-700 focus:ring-blue-300 dark:bg-blue-500 dark:hover:bg-blue-600 dark:focus:ring-blue-800`;
const buttonGreenStyle =
  `${buttonBaseStyle} bg-green-600 hover:bg-green-700 focus:ring-green-300 dark:bg-green-500 dark:hover:bg-green-600 dark:focus:ring-green-800`;
const textareaStyle =
  "w-full border rounded-lg p-2.5 text-sm bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white";
const hintStyle = "text-xs text-gray-600 dark:text-gray-400 mt-1";
const emptyStyle =
  "text-gray-600 dark:text-gray-400 text-sm text-center flex flex-col justify-center items-center h-64";
const buttonRedStyle =
  `${buttonBaseStyle} bg-red-600 hover:bg-red-700 focus:ring-red-300 dark:bg-red-500 dark:hover:bg-red-600 dark:focus:ring-red-800`;
