import { init as adminInit } from "@instantdb/admin";
import { init, InstantReactWebDatabase } from "@instantdb/react";
import { coerce } from "gamla";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { adminToken } from "../../backend/src/db.ts";
import schema from "../../instant.schema.ts";
import {
  createConversation,
  createIdentity,
  instantAppId,
} from "../../protocol/src/api.ts";
import { Chat, Credentials } from "./src/main.tsx";

const adminDb = adminInit({ appId: instantAppId, adminToken, schema });

const prepareConversation = async (
  db: InstantReactWebDatabase<typeof schema>,
) => {
  const alice = await createIdentity("alice");
  const bob = await createIdentity("bob");
  const convo = await createConversation(db)([
    alice.publicSignKey,
    bob.publicSignKey,
  ], "new chat");
  if (!("conversationId" in convo)) {
    throw new Error("Failed to create conversation");
  }
  return { conversationId: convo.conversationId, alice };
};

const Main = ({ db }: { db: InstantReactWebDatabase<typeof schema> }) => {
  const activeUser = db.useAuth().user;
  const [alice, setAlice] = useState<Credentials | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const ChatWithDb = Chat(db);
  useEffect(() => {
    console.log("signing in");
    adminDb.auth.createToken("alice@gmail.com").then(db.auth.signInWithToken);
  }, []);
  useEffect(() => {
    prepareConversation(db)
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
      <ChatWithDb
        credentials={alice}
        conversationId={conversationId}
      />
    ));
};

render(
  <Main db={init({ appId: instantAppId, schema })} />,
  coerce(document.getElementById("root")),
);
