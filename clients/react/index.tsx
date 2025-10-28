import { init as initAdmin, type InstantAdminDatabase } from "@instantdb/admin";
import { init, type InstantReactWebDatabase } from "@instantdb/react";
import { signal } from "@preact/signals";
import { coerce } from "gamla";
import { render } from "preact";
import schema from "../../instant.schema.ts";
import {
  type Credentials,
  instantAppId,
} from "../../protocol/src/clientApi.ts";
import { registerPush } from "../../protocol/src/pushClient.ts";
import { Widget } from "../../widget/src/widget.tsx";
import { useCredentials, useGetOrCreateConversation } from "./src/hooks.ts";
import { Chat } from "./src/main.tsx";

const widgetMode = signal(true);

const WithCredentials = (
  { participants, db, adminDb, initialMessage }: {
    participants: Credentials[];
    initialMessage?: string;
    db: () => InstantReactWebDatabase<typeof schema>;
    adminDb: () => InstantAdminDatabase<typeof schema>;
  },
) => {
  const ChatWithDb = Chat(db);
  const conversation = useGetOrCreateConversation(adminDb, db)({
    credentials: participants[0],
    initialMessage,
    participants: participants.map((p) => p.publicSignKey),
  });
  if (widgetMode.value) {
    return (
      <Widget
        onNameChosen={() => {}}
        credentials={participants[0]}
        participants={participants.map((x) => x.publicSignKey)}
      />
    );
  }
  return conversation
    ? (
      <div style={{ display: "flex", gap: 10, height: 850 }}>
        {participants.slice(0, widgetMode.value ? 1 : participants.length)
          .map((p) => (
            <ChatWithDb
              key={p.publicSignKey}
              credentials={p}
              conversationId={conversation}
            />
          ))}
      </div>
    )
    : <div>preparing conversation</div>;
};

const Main = (
  { adminDb, db }: {
    adminDb: () => InstantAdminDatabase<typeof schema>;
    db: () => InstantReactWebDatabase<typeof schema>;
  },
) => {
  const alice = useCredentials("alice", "demo-alice");
  const bot = useCredentials("bot", "demo-bot");
  const eve = useCredentials("eve", "demo-eve");
  return !alice || !bot || !eve
    ? (
      <div>
        Preparing credentials
      </div>
    )
    : (
      <>
        <button
          type="button"
          onClick={() => {
            widgetMode.value = !widgetMode.value;
          }}
        >
          toggle mode
        </button>
        <button
          type="button"
          onClick={() => {
            registerPush(alice).catch(console.error);
          }}
        >
          enable push
        </button>
        <WithCredentials
          adminDb={adminDb}
          db={db}
          participants={[alice, bot, eve]}
        />
      </>
    );
};

render(
  <Main
    adminDb={() =>
      initAdmin({ appId: instantAppId, schema }).asUser({ guest: true })}
    db={() => init({ appId: instantAppId, schema, devtool: false })}
  />,
  coerce(document.getElementById("root")),
);
