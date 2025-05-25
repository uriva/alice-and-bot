import { init, type InstantReactWebDatabase } from "@instantdb/react";
import { coerce } from "gamla";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import schema from "../../instant.schema.ts";
import {
  createConversation,
  createIdentity,
  type Credentials,
  instantAppId,
} from "../../protocol/src/api.ts";
import { Chat } from "./src/main.tsx";

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


