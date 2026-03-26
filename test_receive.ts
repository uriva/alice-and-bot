import { init } from "@instantdb/core";
import { query } from "./backend/src/db.ts";
import { instantAppId } from "./protocol/src/clientApi.ts";

const db = init({ appId: instantAppId });

async function main() {
  const { conversations } = await query({
    conversations: {
      $: { order: { updatedAt: "desc" }, limit: 1 },
    },
  });

  const conversationId = conversations[0].id;
  console.log("Listening for streams on:", conversationId);
  const room = db.joinRoom("conversations", conversationId);

  room.subscribeTopic("stream", (event: unknown, _peer: unknown) => {
    console.log("Received event via room.subscribeTopic:", event);
  });

  db.subscribeConnectionStatus((status) => {
    console.log("Connection status:", status);
  });

  console.log("Subscribed. Waiting for events...");
}

main();
