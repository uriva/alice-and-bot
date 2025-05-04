import { coerce } from "gamla";
import { render } from "preact";
import { apiClient } from "../../backend/src/api.ts";
import { generateKeyPair } from "../../protocol/src/crypto.ts";
import { Chat, Credentials } from "./src/main.tsx";
import { init } from "@instantdb/react";
import { instantAppId } from "../../protocol/src/api.ts";
import schema from "../../instant.schema.ts";
import { useEffect, useState } from "preact/hooks";
import { init as adminInit } from "@instantdb/admin";

const { useAuth, auth } = init({ appId: instantAppId, schema });

const adminDb = adminInit({
  appId: instantAppId,
  adminToken: "ef7dc3c0-6453-4257-9f92-31e5df140656", // todo
  schema,
});

const prepareConversation = async (accountToken: string) => {
  const alice = await createIdentity(accountToken);
  const bob = await createIdentity(accountToken);
  const convo = await apiClient("createConversation", accountToken, {
    title: "new chat",
    publicSignKeys: [alice.publicSignKey, bob.publicSignKey],
  });
  if (!convo.success) throw new Error("Failed to create conversation");
  return { conversationId: convo.conversationId, alice };
};

const createIdentity = async (accountToken: string) => {
  const signKey = await generateKeyPair("sign");
  const encryptKey = await generateKeyPair("encrypt");
  const result = await apiClient("createIdentity", accountToken, {
    publicSignKey: signKey.publicKey,
    publicEncryptKey: encryptKey.publicKey,
  });
  if (!result.success) {
    throw new Error("Failed to create identity");
  }
  return {
    publicSignKey: signKey.publicKey,
    privateSignKey: signKey.privateKey,
    privateEncryptKey: encryptKey.privateKey,
  };
};

const Main = () => {
  const token = useAuth().user?.refresh_token;
  const [alice, setAlice] = useState<Credentials | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  useEffect(() => {
    adminDb.auth.createToken("alice@gmail.com").then(auth.signInWithToken);
  }, []);
  useEffect(() => {
    if (!token) return;
    prepareConversation(token)
      .then(({ alice, conversationId }) => {
        setAlice(alice);
        setConversationId(conversationId);
      })
      .catch(console.error);
  }, [token]);
  return (!token
    ? <div>Not logged in</div>
    : !alice || !conversationId
    ? <div>preparing user and conversation</div>
    : (
      <Chat
        credentials={alice}
        conversationId={conversationId}
        userInstantToken={token}
      />
    ));
};

render(
  <Main />,
  coerce(document.getElementById("root")),
);
