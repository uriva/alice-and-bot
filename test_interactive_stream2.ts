// deno-lint-ignore-file no-explicit-any
import { instantAppId } from "./protocol/src/clientApi.ts";

if (typeof globalThis.window === "undefined") {
  (globalThis as any).window = {
    location: { search: "" },
    addEventListener: () => {},
    removeEventListener: () => {},
    setTimeout,
    clearTimeout,
  };
}
if (typeof (globalThis as any).indexedDB === "undefined") {
  (globalThis as any).indexedDB = {
    open: () => {
      const req: any = {};
      setTimeout(() => {
        if (req.onsuccess) {
          req.onsuccess({
            target: {
              result: {
                transaction: () => ({
                  objectStore: () => ({
                    get: () => {
                      const r: any = {};
                      setTimeout(() => r.onsuccess?.(), 0);
                      return r;
                    },
                    put: () => {
                      const r: any = {};
                      setTimeout(() => r.onsuccess?.(), 0);
                      return r;
                    },
                  }),
                }),
              },
            },
          });
        }
      }, 0);
      return req;
    },
  };
}
if (typeof navigator === "undefined" || !navigator.onLine) {
  Object.defineProperty(globalThis, "navigator", {
    value: { onLine: true },
    writable: true,
  });
}

import { init } from "@instantdb/core";
import { query as adminQuery } from "./backend/src/db.ts";

async function main() {
  const { conversations } = await adminQuery({
    conversations: {
      $: { order: { updatedAt: "desc" }, limit: 1 },
      participants: {},
    },
  });

  if (!conversations.length) {
    console.log("No conversations found");
    return;
  }

  const conversation = conversations[0];
  const conversationId = conversation.id;
  const botId = conversation.participants[1]?.publicSignKey || "bot";

  const elementId = "test-bot-reply-" + Date.now();

  console.log(`\n======================================================`);
  console.log(`🔥 OPEN THIS LINK NOW TO SEE THE STREAM 🔥`);
  console.log(`👉  http://localhost:3002/chat?c=${conversationId}`);
  console.log(`======================================================\n`);

  console.log(
    `Waiting 15 seconds for you to open the link (and sign in if needed)...`,
  );
  for (let i = 15; i > 0; i--) {
    console.log(`${i}...`);
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`\nInjecting stream into the conversation: ${conversationId}`);
  console.log(`Using Bot ID: ${botId}\n`);

  const textToStream =
    "Hello there! The frontend bug is definitely solved. You should see this streaming in smoothly without reloading the page!";
  const words = textToStream.split(" ");
  let currentText = "";

  for (let i = 0; i < words.length; i++) {
    currentText += (i === 0 ? "" : " ") + words[i];
    const delay = Math.floor(Math.random() * 400) + 150;

    await fetch("http://localhost:8000/ui-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        elementId,
        conversationId,
        type: "stream",
        text: currentText,
        active: true,
        authorId: botId,
      }),
    });

    console.log(`Streamed: ${currentText}`);
    await new Promise((r) => setTimeout(r, delay));
  }

  await fetch("http://localhost:8000/ui-update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      elementId,
      conversationId,
      type: "stream",
      text: currentText,
      active: false,
      authorId: botId,
    }),
  });

  console.log("\n✅ Stream complete!");
  Deno.exit(0);
}

main();
