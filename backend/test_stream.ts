import { init as coreInit } from "@instantdb/core";
import { query } from "./src/db.ts";
import { instantAppId } from "../protocol/src/clientApi.ts";

const coreDb = coreInit({ appId: instantAppId });

async function main() {
  const { conversations } = await query({
    conversations: {
      $: { order: { updatedAt: "desc" }, limit: 1 },
    },
  });

  if (!conversations.length) {
    console.log("No conversations found");
    return;
  }

  const conversationId = conversations[0].id;
  console.log("Testing stream on conversation:", conversationId);

  const room = coreDb.joinRoom("conversations", conversationId);
  const elementId = "test-stream-" + Date.now();

  const textChunks = [
    "Hello",
    " this",
    " is",
    " a",
    " test",
    " stream",
    " working!",
  ];
  let currentText = "";

  // Need to wait briefly for coreDb connection?
  await new Promise((r) => setTimeout(r, 1000));

  for (let j = 0; j < 5; j++) {
    for (let i = 0; i < textChunks.length; i++) {
      currentText += textChunks[i];
      console.log("Publishing chunk:", currentText);
      room.publishTopic("stream", {
        elementId,
        text: currentText,
        active: true,
        authorId: "test-bot",
        updatedAt: Date.now(),
      });
      await new Promise((r) => setTimeout(r, 500));
    }

    console.log("Publishing done active: false");
    room.publishTopic("stream", {
      elementId,
      text: currentText,
      active: false,
      authorId: "test-bot",
      updatedAt: Date.now(),
    });

    await new Promise((r) => setTimeout(r, 2000));
    currentText = "";
  }

  console.log("Test finished.");
  Deno.exit(0);
}

main();
