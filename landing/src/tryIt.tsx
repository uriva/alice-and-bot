import { init } from "@instantdb/react";
import { useState } from "preact/hooks";
import { apiClient } from "../../backend/src/api.ts";
import { Chat, Credentials } from "../../clients/react/src/main.tsx";
import schema from "../../instant.schema.ts";
import { createConversation, instantAppId } from "../../protocol/src/api.ts";
import { generateKeyPair } from "../../protocol/src/crypto.ts";

const { queryOnce } = init({ appId: instantAppId, schema });

export const TryIt = () => {
  const [identities, setIdentities] = useState<Credentials[]>([]);
  const [conversations, setConversations] = useState<
    { conversationId: string; credentials: Credentials }[]
  >([]);
  const [selectedConversation, setSelectedConversation] = useState<
    number | null
  >(null);
  const [publicSignKeyInput, setPublicSignKeyInput] = useState("");
  const createIdentity = async () => {
    const signKey = await generateKeyPair("sign");
    const encryptKey = await generateKeyPair("encrypt");
    await apiClient({
      endpoint: "createAnonymousIdentity",
      payload: {
        publicSignKey: signKey.publicKey,
        publicEncryptKey: encryptKey.publicKey,
      },
    });
    setIdentities((ids) => [...ids, {
      publicSignKey: signKey.publicKey,
      privateSignKey: signKey.privateKey,
      privateEncryptKey: encryptKey.privateKey,
    }]);
  };
  const startConversation = async () => {
    if (identities.length === 0 || !publicSignKeyInput.trim()) return;
    const myIdentity = identities[0];
    const participantKeys = [
      myIdentity.publicSignKey,
      ...publicSignKeyInput.split(",").map((k) => k.trim()).filter(Boolean),
    ];
    const result = await createConversation(
      { queryOnce },
      participantKeys,
      "new chat",
    );
    if ("conversationId" in result) {
      setConversations((convs) => [...convs, {
        conversationId: result.conversationId,
        credentials: myIdentity,
      }]);
      setSelectedConversation(conversations.length);
    } else {
      alert("Failed to create conversation: " + result.error);
    }
  };
  return (
    <section class="my-8 p-6 bg-gray-50 dark:bg-gray-800 rounded-lg shadow dark:shadow-blue-900/20 w-full max-w-2xl mx-auto">
      <h2 class="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">
        Try it now
      </h2>
      <div class="mb-4 flex flex-col sm:flex-row gap-2 w-full">
        <button
          type="button"
          class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 w-full sm:w-auto"
          onClick={createIdentity}
        >
          Create Identity
        </button>
        <span class="text-gray-700 dark:text-gray-200 flex items-center">
          ({identities.length} created)
        </span>
      </div>
      <div class="mb-4 flex flex-col sm:flex-row gap-2 items-stretch w-full">
        <input
          class="border px-2 py-1 rounded bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 w-full"
          placeholder="Comma-separated publicSignKey(s) to chat with"
          value={publicSignKeyInput}
          onInput={(e) => setPublicSignKeyInput(e.currentTarget.value)}
        />
        <button
          type="button"
          class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600 w-full sm:w-auto"
          onClick={startConversation}
        >
          Start Conversation
        </button>
      </div>
      <div class="mb-4">
        <h3 class="font-semibold mb-2 text-gray-900 dark:text-gray-100">
          Open Chats
        </h3>
        <ul class="flex gap-2 flex-wrap">
          {conversations.map((_, i) => (
            <li key={i}>
              <button
                type="button"
                class={`px-3 py-1 rounded border transition-colors w-full sm:w-auto mt-1 sm:mt-0 ${
                  selectedConversation === i
                    ? "bg-blue-200 dark:bg-blue-800 text-gray-900 dark:text-gray-100 border-blue-400 dark:border-blue-600"
                    : "bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700"
                }`}
                onClick={() => setSelectedConversation(i)}
              >
                Chat {i + 1}
              </button>
            </li>
          ))}
        </ul>
      </div>
      {selectedConversation !== null && conversations[selectedConversation] && (
        <div class="mt-6 overflow-x-auto">
          <Chat
            credentials={conversations[selectedConversation].credentials}
            conversationId={conversations[selectedConversation].conversationId}
          />
        </div>
      )}
    </section>
  );
};
