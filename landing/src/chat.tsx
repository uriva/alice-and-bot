import { init } from "@instantdb/react";
import { useState } from "preact/hooks";
import { signal } from "@preact/signals";
import { apiClient } from "../../backend/src/api.ts";
import { Chat, type Credentials } from "../../clients/react/src/main.tsx";
import schema from "../../instant.schema.ts";
import { createConversation, instantAppId } from "../../protocol/src/api.ts";
import { generateKeyPair } from "../../protocol/src/crypto.ts";

const { useQuery, queryOnce } = init({ appId: instantAppId, schema });

const nameFromPublicSignKey = async (publicSignKey: string) => {
  const { data } = await queryOnce({
    identities: { $: { where: { publicSignKey } } },
  });
  if (data.identities.length === 0) {
    return publicSignKey;
  }
  return data.identities[0].name;
};

const selectedConversation = signal<string | null>(null);

const startConversation =
  (credentials: Credentials, publicSignKey: string) => async () => {
    if (!credentials) {
      alert("Please create or identify an identity first.");
      return;
    }
    const title = `${await nameFromPublicSignKey(
      credentials.publicSignKey,
    )} & ${await nameFromPublicSignKey(publicSignKey)}`;
    createConversation(
      { queryOnce },
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

export const ChatDemo = () => {
  const [identityName, setIdentityName] = useState("");
  const [credentialsString, setCredentialsString] = useState<string | null>(
    null,
  );
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [inputCredentials, setInputCredentials] = useState("");
  const { data, error, isLoading } = useQuery({
    conversations: {
      $: {
        where: {
          "participants.publicSignKey": credentials?.publicSignKey ?? "",
        },
      },
    },
  });
  if (error) {
    console.error("Error fetching conversations:", error);
    return <div class="text-red-500">Error fetching conversations</div>;
  }
  if (isLoading) {
    return <div class="text-gray-500 dark:text-gray-400">Loading...</div>;
  }
  const { conversations } = data;
  const createIdentity = async () => {
    if (!identityName.trim()) {
      alert("Please enter a name for your identity.");
      return;
    }
    const signKey = await generateKeyPair("sign");
    const encryptKey = await generateKeyPair("encrypt");
    await apiClient({
      endpoint: "createAnonymousIdentity",
      payload: {
        publicSignKey: signKey.publicKey,
        publicEncryptKey: encryptKey.publicKey,
      },
    });
    const creds: Credentials = {
      publicSignKey: signKey.publicKey,
      privateSignKey: signKey.privateKey,
      privateEncryptKey: encryptKey.privateKey,
    };
    setCredentialsString(JSON.stringify(creds));
    setCredentials(creds);
  };

  const identify = () => {
    try {
      const creds = JSON.parse(inputCredentials);
      setCredentials(creds);
    } catch {
      alert("Invalid credentials string");
    }
  };

  return (
    <section class="my-8 p-6 bg-gray-50 dark:bg-gray-800 rounded-lg shadow dark:shadow-blue-900/20 w-full max-w-2xl mx-auto">
      <h2 class="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">
        Try it now
      </h2>

      {!credentials && (
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
              onClick={createIdentity}
            >
              Create Identity
            </button>
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
          <div class="mt-4">
            <label class={labelSmallStyle + " mb-1"}>
              Or paste credentials string to identify:
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
                class={buttonGreenStyle}
                onClick={identify}
              >
                Identify
              </button>
            </div>
          </div>
        </div>
      )}

      {credentials && (
        <div>
          <div class={inputRowStyle + " mb-4"}>
            <button
              type="button"
              class={buttonGreenStyle}
              onClick={startConversation(
                credentials,
                credentials.publicSignKey,
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
const labelStyle = "block mb-2 text-gray-800 dark:text-gray-200 font-semibold";
const labelSmallStyle = "block text-xs text-gray-600 dark:text-gray-400";
const inputRowStyle = "flex gap-2 mb-2";
const inputStyle =
  "border px-2 py-1 rounded bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 w-full";
const buttonBlueStyle =
  "px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600";
const buttonGreenStyle =
  "px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600";
const textareaStyle =
  "w-full border rounded p-2 text-xs bg-gray-100 dark:bg-gray-900 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100";
const hintStyle = "text-xs text-gray-500 mt-1";
const emptyStyle = "text-gray-500 dark:text-gray-400 text-sm";
const chatButtonStyle =
  "px-3 py-1 rounded border transition-colors w-full sm:w-auto mt-1 sm:mt-0 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700";
const chatButtonActiveStyle =
  "bg-blue-200 dark:bg-blue-800 text-gray-900 dark:text-gray-100 border-blue-400 dark:border-blue-600";
