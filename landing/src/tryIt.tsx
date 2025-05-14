import { init } from "@instantdb/react";
import { useState } from "preact/hooks";
import { apiClient } from "../../backend/src/api.ts";
import { Chat, Credentials } from "../../clients/react/src/main.tsx";
import schema from "../../instant.schema.ts";
import { instantAppId } from "../../protocol/src/api.ts";
import { generateKeyPair } from "../../protocol/src/crypto.ts";

const { queryOnce: _queryOnce } = init({ appId: instantAppId, schema });

export const TryIt = () => {
  // State for identity creation
  const [identityName, setIdentityName] = useState("");
  const [credentialsString, setCredentialsString] = useState<string | null>(
    null,
  );
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  // Conversations
  const [conversations, setConversations] = useState<
    { conversationId: string; name: string }[]
  >([]);
  const [selectedConversation, setSelectedConversation] = useState<
    string | null
  >(null);

  // Step 1: Create identity
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
        // Remove name for now, as backend doesn't expect it
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

  // Step 2: Identify as user (load credentials)
  const [inputCredentials, setInputCredentials] = useState("");
  const identify = () => {
    try {
      const creds = JSON.parse(inputCredentials);
      setCredentials(creds);
    } catch {
      alert("Invalid credentials string");
    }
  };

  // Step 3: Query server for existing chats (stub for now)
  const fetchConversations = () => {
    // TODO: Replace with real API call
    setConversations([]);
  };

  // Step 4: Select or create conversation
  const selectConversation = (id: string) => {
    setSelectedConversation(id);
  };

  // Step 5: Start new conversation (stub)
  const startConversation = () => {
    // Not implemented yet
    alert("Start new conversation: not implemented yet");
  };
  return (
    <section class="my-8 p-6 bg-gray-50 dark:bg-gray-800 rounded-lg shadow dark:shadow-blue-900/20 w-full max-w-2xl mx-auto">
      <h2 class="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">
        Try it now
      </h2>

      {/* Step 1: Create identity */}
      {!credentials && (
        <div class="mb-6">
          <label class="block mb-2 text-gray-800 dark:text-gray-200 font-semibold">
            Create a new identity
          </label>
          <div class="flex gap-2 mb-2">
            <input
              class="border px-2 py-1 rounded bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 w-full"
              placeholder="Enter your name"
              value={identityName}
              onInput={(e) => setIdentityName(e.currentTarget.value)}
            />
            <button
              type="button"
              class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
              onClick={createIdentity}
            >
              Create Identity
            </button>
          </div>
          {credentialsString && (
            <div class="mt-2">
              <label class="block text-xs text-gray-600 dark:text-gray-400">
                Save your credentials string:
              </label>
              <textarea
                class="w-full border rounded p-2 text-xs bg-gray-100 dark:bg-gray-900 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100"
                value={credentialsString}
                readOnly
                rows={3}
              />
              <div class="text-xs text-gray-500 mt-1">
                Copy and save this string to identify as this user later.
              </div>
            </div>
          )}
          <div class="mt-4">
            <label class="block text-xs text-gray-600 dark:text-gray-400 mb-1">
              Or paste credentials string to identify:
            </label>
            <div class="flex gap-2">
              <input
                class="border px-2 py-1 rounded bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 w-full"
                placeholder="Paste credentials string here"
                value={inputCredentials}
                onInput={(e) => setInputCredentials(e.currentTarget.value)}
              />
              <button
                type="button"
                class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600"
                onClick={identify}
              >
                Identify
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Conversations */}
      {credentials && (
        <div>
          <div class="mb-4 flex gap-2">
            <button
              type="button"
              class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
              onClick={fetchConversations}
            >
              Refresh Conversations
            </button>
            <button
              type="button"
              class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600"
              onClick={startConversation}
            >
              Start New Conversation
            </button>
          </div>
          <div class="mb-4">
            <h3 class="font-semibold mb-2 text-gray-900 dark:text-gray-100">
              Open Chats
            </h3>
            {conversations.length === 0
              ? (
                <div class="text-gray-500 dark:text-gray-400 text-sm">
                  No conversations yet.
                </div>
              )
              : (
                <ul class="flex gap-2 flex-wrap">
                  {conversations.map((conv) => (
                    <li key={conv.conversationId}>
                      <button
                        type="button"
                        class={`px-3 py-1 rounded border transition-colors w-full sm:w-auto mt-1 sm:mt-0 ${
                          selectedConversation === conv.conversationId
                            ? "bg-blue-200 dark:bg-blue-800 text-gray-900 dark:text-gray-100 border-blue-400 dark:border-blue-600"
                            : "bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700"
                        }`}
                        onClick={() => selectConversation(conv.conversationId)}
                      >
                        {conv.name || conv.conversationId}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
          </div>
          {selectedConversation && (
            <div class="mt-6 overflow-x-auto">
              <Chat
                credentials={credentials}
                conversationId={selectedConversation}
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
};
