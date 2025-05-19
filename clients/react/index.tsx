import { init as adminInit } from "@instantdb/admin";
import { init } from "@instantdb/react";
import { coerce } from "gamla";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { apiClient } from "../../backend/src/api.ts";
import { adminToken } from "../../backend/src/db.ts";
import schema from "../../instant.schema.ts";
import { createConversation, instantAppId } from "../../protocol/src/api.ts";
import { generateKeyPair } from "../../protocol/src/crypto.ts";
import { Chat, Credentials } from "./src/main.tsx";

const { useAuth, auth, queryOnce } = init({ appId: instantAppId, schema });

const adminDb = adminInit({ appId: instantAppId, adminToken, schema });

const prepareConversation = async () => {
  const alice = await createIdentity();
  const bob = await createIdentity();
  const convo = await createConversation({ queryOnce }, [
    alice.publicSignKey,
    bob.publicSignKey,
  ], "new chat");
  if (!("conversationId" in convo)) {
    throw new Error("Failed to create conversation");
  }
  return { conversationId: convo.conversationId, alice };
};

const createIdentity = async () => {
  const signKey = await generateKeyPair("sign");
  const encryptKey = await generateKeyPair("encrypt");
  const result = await apiClient({
    endpoint: "createAnonymousIdentity",
    payload: {
      publicSignKey: signKey.publicKey,
      publicEncryptKey: encryptKey.publicKey,
    },
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
  const activeUser = useAuth().user;
  const [alice, setAlice] = useState<Credentials | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  useEffect(() => {
    console.log("signing in");
    adminDb.auth.createToken("alice@gmail.com").then(auth.signInWithToken);
  }, []);
  useEffect(() => {
    if (!activeUser) return;
    console.log("preparing conversation");
    prepareConversation()
      .then(({ alice, conversationId }) => {
        setAlice(alice);
        setConversationId(conversationId);
      })
      .catch(console.error);
  }, [activeUser?.email]);
  return (!activeUser?.refresh_token
    ? <div>Not logged in</div>
    : !alice || !conversationId
    ? <div>preparing user and conversation</div>
    : (
      <Chat
        credentials={alice}
        conversationId={conversationId}
      />
    ));
};

render(
  <Main />,
  coerce(document.getElementById("root")),
);
