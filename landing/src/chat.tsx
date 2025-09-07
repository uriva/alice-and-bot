import { init } from "@instantdb/react";
import { effect, signal } from "@preact/signals";
import { useLocation } from "preact-iso";
import { useEffect, useState } from "preact/hooks";
import {
  type Conversation,
  useConversations,
  useDarkMode,
  useIdentityProfile,
  useUserName,
} from "../..//clients/react/src/hooks.ts";
import { aliasToPublicSignKey } from "../../backend/src/api.ts";
import { ChatAvatar } from "../../clients/react/src/abstractChatBox.tsx";
import { stringToColor } from "../../clients/react/src/design.tsx";
import { Chat as ChatNoDb } from "../../clients/react/src/main.tsx";
import schema from "../../instant.schema.ts";
import { normalizeAlias } from "../../protocol/src/alias.ts";
import {
  chatWithMeLink,
  createConversation,
  createIdentity,
  type Credentials,
  instantAppId,
  setAlias,
} from "../../protocol/src/clientApi.ts";
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

// Create a conversation with one or more other participants. Each token can be a
// public sign key or an alias. Comma separated list.
const startConversation = async (
  credentials: Credentials,
  rawInput: string,
) => {
  // Split by comma, trim, drop empties
  const tokens = rawInput.split(",").map((t) => t.trim()).filter(Boolean);
  if (tokens.length === 0) {
    alert("Please enter at least one participant public key or alias");
    return;
  }
  // Resolve each token: try alias lookup first; fallback to original (assume key)
  const resolved = await Promise.all(tokens.map(async (token) => {
    try {
      const res = await aliasToPublicSignKey(token);
      if ("publicSignKey" in res) return res.publicSignKey;
    } catch (_) {
      // network / other errors fall through to treat as key
    }
    return token; // assume it's already a public sign key
  }));
  // Include current user and dedupe
  const participantKeys = Array.from(
    new Set([
      credentials.publicSignKey,
      ...resolved.filter((k) => k !== credentials.publicSignKey),
    ]),
  );
  if (participantKeys.length < 2) {
    alert("Need at least one other participant");
    return;
  }
  // Build title from names (fallback to key if missing)
  const names = await Promise.all(
    participantKeys.map((k) => nameFromPublicSignKey(k)),
  );
  const title = names.join(", ");
  const response = await createConversation(() => db)(participantKeys, title);
  if (!("conversationId" in response)) {
    alert(`Failed to create conversation: ${response.error}`);
    return;
  }
  selectedConversation.value = response.conversationId;
};

const NewUserForm = ({ onCreated, storeInBrowser, setStoreInBrowser }: {
  onCreated: (creds: Credentials) => void;
  storeInBrowser: boolean;
  setStoreInBrowser: (v: boolean) => void;
}) => {
  const [identityName, setIdentityName] = useState("");
  const [alias, setAliasInput] = useState("");
  const [credentialsString, setCredentialsString] = useState<string | null>(
    null,
  );
  const [creating, setCreating] = useState(false);
  const [aliasStatus, setAliasStatus] = useState<
    null | { type: "error" | "success"; message: string }
  >(null);

  const onClickCreateIdentity = async () => {
    if (!identityName.trim()) {
      alert("Please enter a name for your identity.");
      return;
    }
    const trimmedAlias = alias.trim().toLowerCase();
    if (!trimmedAlias) {
      alert("Please choose a public alias.");
      return;
    }
    // Front-end validation similar to server rules
    const normalized = trimmedAlias.replace(/[^a-z0-9_]/g, "").slice(0, 15);
    if (normalized !== trimmedAlias || normalized.length === 0) {
      alert(
        "Alias must be lowercase letters, numbers, underscore. Max 15 chars.",
      );
      return;
    }
    setCreating(true);
    setAliasStatus(null);
    try {
      // Pre-check alias availability before creating identity
      try {
        const existing = await aliasToPublicSignKey(normalized);
        if ("publicSignKey" in existing) {
          setAliasStatus({
            type: "error",
            message: "Alias already taken. Please choose another.",
          });
          setCreating(false);
          return;
        }
      } catch (_e) {
        // If the check fails for network reasons, allow user to decide
        const proceed = confirm(
          "Couldn't verify alias availability (network error). Proceed anyway?",
        );
        if (!proceed) {
          setCreating(false);
          return;
        }
      }
      const creds = await createIdentity(identityName, normalized);
      // Attempt to set alias immediately
      const res = await setAlias({ alias: normalized, credentials: creds });
      if (!res.success) {
        let message = "Failed to set alias";
        if (res.error === "alias-taken") message = "Alias already taken";
        if (res.error === "invalid-alias") message = "Invalid alias";
        if (res.error === "invalid-auth") message = "Auth failed";
        if (res.error === "not-found") message = "Identity not found";
        setAliasStatus({ type: "error", message });
      } else {
        setAliasStatus({ type: "success", message: "Alias set" });
      }
      const credsStr = JSON.stringify(creds);
      setCredentialsString(credsStr);
      onCreated(creds);
      if (storeInBrowser) {
        try {
          localStorage.setItem("alicebot_credentials", credsStr);
        } catch (e) {
          console.error("failed storing credentials in localStorage", e);
        }
      }
    } catch (e) {
      console.error("Error creating identity", e);
      alert("Unexpected error creating identity");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div class={sectionSpacing}>
      <label class={labelStyle}>Create a new identity</label>
      <div
        style={{ display: "flex", flexDirection: "column" }}
        class={inputRowStyle}
      >
        <div>
          <input
            class={inputStyle}
            placeholder="Choose @alias"
            value={alias}
            onInput={(e) =>
              setAliasInput(normalizeAlias(e.currentTarget.value))}
          />
          <div class={hintStyle}>
            Your public handle/callsign/username.
          </div>
          <div class={hintStyle}>
            Use lowercase letters, numbers, underscore. Max 15 chars.
          </div>
          <div class={hintStyle}>
            You can change it later.
          </div>
          {aliasStatus && (
            <div
              class={`text-xs mt-1 ${
                aliasStatus.type === "error"
                  ? "text-red-600 dark:text-red-400"
                  : "text-green-600 dark:text-green-400"
              }`}
            >
              {aliasStatus.message}
            </div>
          )}
        </div>
        <div>
          <input
            class={inputStyle}
            placeholder="Display name"
            value={identityName}
            onInput={(e) => setIdentityName(e.currentTarget.value)}
          />
          <div class={hintStyle}>
            A display name that people will see in chats.
          </div>
          <div class={hintStyle}>
            You can change it later.
          </div>
        </div>
        <div>
          <button
            type="button"
            class={buttonBlueStyle}
            onClick={onClickCreateIdentity}
            disabled={creating}
          >
            {creating ? "Creating..." : "Sign up"}
          </button>
          <div class={`${hintStyle} mt-1`}>No email or phone required.</div>
        </div>
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
        } catch (e) {
          console.error("failed storing credentials in localStorage", e);
        }
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

const YourKey = ({ credentials }: { credentials: Credentials }) => {
  const publicSignKey = credentials.publicSignKey;
  const name = useUserName(() => db)(publicSignKey);
  const profile = useIdentityProfile(() => db)(publicSignKey);
  const [aliasInput, setAliasInput] = useState(profile?.alias ?? "");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<
    null | { type: "success" | "error"; message: string }
  >(null);
  // Keep alias input in sync if it appears later
  useEffect(() => {
    setAliasInput(profile?.alias ?? "");
  }, [profile?.alias]);

  const onSaveAlias = async () => {
    const trimmed = aliasInput.trim();
    if (!trimmed) {
      setStatus({ type: "error", message: "Alias can't be empty" });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      const res = await setAlias({ alias: trimmed, credentials });
      if (res.success) {
        setStatus({ type: "success", message: "Alias saved" });
        // Alias will reflect via reactive query; keep local field normalized (same as server)
        setAliasInput(
          trimmed.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 15),
        );
      } else {
        let message = "Failed to set alias";
        if (res.error === "alias-taken") message = "Alias already taken";
        if (res.error === "invalid-alias") message = "Invalid alias";
        if (res.error === "not-found") message = "Identity not found";
        if (res.error === "invalid-auth") message = "Authentication failed";
        setStatus({ type: "error", message });
      }
    } catch (e) {
      console.error("Alias save error", e);
      setStatus({ type: "error", message: "Unexpected error" });
    } finally {
      setSaving(false);
      setTimeout(() => {
        setStatus((s) => (s?.type === "success" ? null : s));
      }, 2000);
    }
  };

  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
      class={`${textColorStyle} mb-2`}
    >
      <div>Your display name: {name ?? "loading..."}</div>
      <div>
        Your user id is <CopyableString str={publicSignKey} />
      </div>
      <div>
        Invite others to chat with you:&nbsp;
        <CopyableString str={chatWithMeLink(publicSignKey)} />
      </div>
      <div class="flex flex-col gap-1 max-w-md">
        <label class={labelSmallStyle}>Public alias (optional)</label>
        <div class="flex gap-2 items-center">
          <input
            class={inputStyle + " flex-grow"}
            placeholder="choose-alias"
            value={aliasInput}
            onInput={(e) =>
              setAliasInput(
                e.currentTarget.value.toLowerCase().replace(/[^a-z0-9_]/g, "")
                  .slice(0, 15),
              )}
            disabled={saving}
          />
          <button
            type="button"
            class={buttonGreenStyle}
            disabled={saving}
            onClick={onSaveAlias}
          >
            {saving ? "Saving..." : profile?.alias ? "Update" : "Set"} alias
          </button>
        </div>
        <div class={hintStyle}>
          Lowercase letters, numbers, underscore. Max 15 chars. Public &
          shareable.
        </div>
        {status && (
          <div
            class={`text-xs ${
              status.type === "success"
                ? "text-green-600 dark:text-green-400"
                : "text-red-600 dark:text-red-400"
            }`}
          >
            {status.message}
          </div>
        )}
        {profile?.alias && (
          <div class={hintStyle}>
            Current alias:&nbsp;
            <span class="font-mono">@{profile.alias}</span>
          </div>
        )}
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
          placeholder="Recipient alias or public key (comma separated for group)"
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
              startConversation(credentials, otherParticipantPubKey)}
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

const LoggedInMessenger = (
  { view, setView, credentials }: {
    view: View;
    setView: (view: View) => void;
    credentials: Credentials;
  },
) => (
  <div
    style={{ display: "flex", flexGrow: 1, flexDirection: "column" }}
  >
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
      {view === "identity" && <YourKey credentials={credentials} />}
    </div>
  </div>
);

const MessengerLogin = ({ setCredentials }: {
  setCredentials: (creds: Credentials) => void;
}) => {
  const [storeInBrowser, setStoreInBrowser] = useState(true);
  const [showForm, setShowForm] = useState<null | "new" | "existing">(null);
  const [showWhat, setShowWhat] = useState(false);
  const [showNoEmail, setShowNoEmail] = useState(false);
  return (
    <div class="flex flex-col flex-grow">
      {showForm === null && (
        <div class="flex flex-col items-center gap-4 mb-6 flex-grow justify-center text-center px-4">
          <div class="text-lg font-semibold max-w-xl">
            To start, we need your alice&bot identity. Do you have one?
          </div>
          <div class="flex gap-3">
            <button
              type="button"
              class={buttonBlueStyle}
              onClick={() => setShowForm("existing")}
            >
              Yes
            </button>
            <button
              type="button"
              class={buttonGreenStyle}
              onClick={() => setShowForm("new")}
            >
              No
            </button>
          </div>
        </div>
      )}
      {showForm === null && (
        <div class="pt-2 self-center max-w-md w-full">
          <button
            type="button"
            class="w-full flex justify-between items-center py-2 px-3 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
            onClick={() => setShowWhat((v) => !v)}
          >
            <span class="text-lg font-semibold">What is Alice&Bot?</span>
            <span class="ml-2 text-gray-500">{showWhat ? "▲" : "▼"}</span>
          </button>
          {showWhat && (
            <div class="px-3 mt-2 text-base">
              An end-to-end encrypted messenger for people and bots. Create a
              self-owned cryptographic identity and chat using a public key or
              an @alias.
            </div>
          )}
          <div class="mt-3"></div>
          <button
            type="button"
            class="w-full flex justify-between items-center py-2 px-3 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
            onClick={() => setShowNoEmail((v) => !v)}
          >
            <span class="text-lg font-semibold">
              Do I need to give out my email or phone?
            </span>
            <span class="ml-2 text-gray-500">{showNoEmail ? "▲" : "▼"}</span>
          </button>
          {showNoEmail && (
            <div class="px-3 mt-2 text-base">
              No. You create a self-owned identity right here—no email, phone
              number, or personal info required. Your keys are generated locally
              in your browser. You can keep the credentials in this browser or
              copy the credentials string to store safely elsewhere.
            </div>
          )}
        </div>
      )}
      {showForm === "new" && (
        <NewUserForm
          onCreated={setCredentials}
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
  );
};

export const Messenger = () => {
  const location = useLocation();
  const [credentials, setCredentials] = useState<Credentials | null>(null);

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
    <div class={`p-4 flex flex-col h-screen ${textColorStyle} md:items-center`}>
      <div class="flex flex-col flex-grow w-full md:max-w-2xl lg:max-w-3xl">
        <div class="mb-4">
          <div class="text-xl font-bold ">👧🤖 Alice&Bot</div>
          <div>encrypted chat for AI era</div>
        </div>
        {!credentials && <MessengerLogin setCredentials={setCredentials} />}
        {credentials && (
          <LoggedInMessenger
            setView={setView}
            credentials={credentials}
            view={view}
          />
        )}
      </div>
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
