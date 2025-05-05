import { useState } from "preact/hooks";
import { apiClient } from "../../backend/src/api.ts";
import { Chat, Credentials } from "../../clients/react/src/main.tsx";
import { generateKeyPair } from "../../protocol/src/crypto.ts";

export const TryIt = () => {
  const [identities, setIdentities] = useState<Credentials[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<
    number | null
  >(null);
  const [publicSignKeyInput, setPublicSignKeyInput] = useState("");
  const [userToken, setUserToken] = useState<string>("demo-token"); // Replace with real token logic if needed

  // Create a new identity
  const createIdentity = async () => {
    const signKey = await generateKeyPair("sign");
    const encryptKey = await generateKeyPair("encrypt");
    await apiClient("createIdentity", userToken, {
      publicSignKey: signKey.publicKey,
      publicEncryptKey: encryptKey.publicKey,
    });
    setIdentities((ids) => [...ids, {
      publicSignKey: signKey.publicKey,
      privateSignKey: signKey.privateKey,
      privateEncryptKey: encryptKey.privateKey,
    }]);
  };

  // Start a conversation with one or more participants
  const startConversation = async () => {
    if (identities.length === 0 || !publicSignKeyInput.trim()) return;
    const myIdentity = identities[0];
    const participantKeys = [
      myIdentity.publicSignKey,
      ...publicSignKeyInput.split(",").map((k) => k.trim()).filter(Boolean),
    ];
    const result = await apiClient("createConversation", userToken, {
      title: "Test Chat",
      publicSignKeys: participantKeys,
    });
    if (result.success) {
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
    <section class="my-8 p-6 bg-gray-50 rounded-lg shadow">
      <h2 class="text-xl font-bold mb-4">Try it now</h2>
      <div class="mb-4 flex gap-2">
        <button
          type="button"
          class="px-4 py-2 bg-blue-600 text-white rounded"
          onClick={createIdentity}
        >
          Create Identity
        </button>
        <span class="text-gray-700">({identities.length} created)</span>
      </div>
      <div class="mb-4 flex gap-2 items-center">
        <input
          class="border px-2 py-1 rounded w-96"
          placeholder="Comma-separated publicSignKey(s) to chat with"
          value={publicSignKeyInput}
          onInput={(e) => setPublicSignKeyInput(e.currentTarget.value)}
        />
        <button
          type="button"
          class="px-4 py-2 bg-green-600 text-white rounded"
          onClick={startConversation}
        >
          Start Conversation
        </button>
      </div>
      <div class="mb-4">
        <h3 class="font-semibold mb-2">Open Chats</h3>
        <ul class="flex gap-2 flex-wrap">
          {conversations.map((c, i) => (
            <li key={i}>
              <button
                type="button"
                class={`px-3 py-1 rounded border ${
                  selectedConversation === i ? "bg-blue-200" : "bg-white"
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
        <div class="mt-6">
          <Chat
            credentials={conversations[selectedConversation].credentials}
            conversationId={conversations[selectedConversation].conversationId}
            userInstantToken={userToken}
          />
        </div>
      )}
    </section>
  );
};
