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
  const bot = await createIdentity("bot");
  const convo = await createConversation(() => db)([
    alice.publicSignKey,
    bot.publicSignKey,
  ], "new chat");
  if (!("conversationId" in convo)) {
    throw new Error("Failed to create conversation");
  }
  return { conversationId: convo.conversationId, alice, bot };
};

const Main = ({ db }: { db: () => InstantReactWebDatabase<typeof schema> }) => {
  const [alice, setAlice] = useState<Credentials | null>(null);
  const [bot, setBot] = useState<Credentials | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [showAlice, setShowAlice] = useState(true);
  const [showBot, setShowBot] = useState(true);
  const ChatWithDb = Chat(db);
  useEffect(() => {
    prepareConversation(db())
      .then(({ alice, bot, conversationId }) => {
        setAlice(alice);
        setBot(bot);
        setConversationId(conversationId);
      })
      .catch(console.error);
  }, []);
  return !alice || !conversationId || !bot
    ? <div>preparing user and conversation</div>
    : (
      <div>
        <input
          type="checkbox"
          id="show-alice"
          checked={showAlice}
          onChange={(e) => setShowAlice(e.currentTarget.checked)}
        />
        <label htmlFor="show-alice">Show alice</label>
        <input
          type="checkbox"
          id="show-bot"
          checked={showBot}
          onChange={(e) => setShowBot(e.currentTarget.checked)}
        />
        <label htmlFor="show-bot">Show bot</label>
        <div>
          {showAlice && (
            <ChatWithDb
              credentials={alice}
              conversationId={conversationId}
            />
          )}
          {showBot && (
            <ChatWithDb
              credentials={bot}
              conversationId={conversationId}
            />
          )}
        </div>
      </div>
    );
};

render(
  <Main db={() => init({ appId: instantAppId, schema })} />,
  coerce(document.getElementById("root")),
);
