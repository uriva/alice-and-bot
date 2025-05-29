import { init, type InstantReactWebDatabase } from "@instantdb/react";
import { coerce } from "gamla";
import { render } from "preact";
import schema from "../../instant.schema.ts";
import { type Credentials, instantAppId } from "../../protocol/src/api.ts";
import { useCredentials, useGetOrCreateConversation } from "./src/hooks.ts";
import { Chat } from "./src/main.tsx";

const WithCredentials = (
  { participants, db }: {
    participants: Credentials[];
    db: () => InstantReactWebDatabase<typeof schema>;
  },
) => {
  const ChatWithDb = Chat(db);
  const conversation = useGetOrCreateConversation(db)(
    participants[0],
    participants.map((p) => p.publicSignKey),
  );
  return conversation
    ? (
      <div style={{ display: "flex", gap: 10 }}>
        {participants.map((p) => (
          <ChatWithDb credentials={p} conversationId={conversation} />
        ))}
      </div>
    )
    : <div>preparing conversation</div>;
};

const Main = ({ db }: { db: () => InstantReactWebDatabase<typeof schema> }) => {
  const alice = useCredentials("alice", "demo-alice");
  const bot = useCredentials("bot", "demo-bot");
  const eve = useCredentials("eve", "demo-eve");
  return !alice || !bot || !eve
    ? <div>Preparing credentials</div>
    : <WithCredentials db={db} participants={[alice, bot, eve]} />;
};

render(
  <Main db={() => init({ appId: instantAppId, schema })} />,
  coerce(document.getElementById("root")),
);
