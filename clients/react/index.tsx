import { init as adminInit } from "@instantdb/admin";
import { init } from "@instantdb/react";
import { coerce } from "gamla";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { adminToken } from "../../backend/src/db.ts";
import schema from "../../instant.schema.ts";
import { createConversation, instantAppId, createIdentity } from "../../protocol/src/api.ts";
import { Chat, Credentials } from "./src/main.tsx";

const { useAuth, auth, queryOnce } = init({ appId: instantAppId, schema });

const adminDb = adminInit({ appId: instantAppId, adminToken, schema });

const prepareConversation = async () => {
  const alice = await createIdentity("alice");
  const bob = await createIdentity("bob");
  const convo = await createConversation({ queryOnce }, [
    alice.publicSignKey,
    bob.publicSignKey,
  ], "new chat");
  if (!("conversationId" in convo)) {
    throw new Error("Failed to create conversation");
  }
  return { conversationId: convo.conversationId, alice };
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
