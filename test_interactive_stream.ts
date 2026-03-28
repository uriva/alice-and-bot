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
    conversations: { $: { order: { updatedAt: "desc" }, limit: 1 } },
  });

  if (!conversations.length) {
    console.log("No conversations found");
    return;
  }

  const conversationId = conversations[0].id;
  const elementId = "test-bot-reply-" + Date.now();

  console.log(
    `Injecting stream into the latest conversation: ${conversationId}`,
  );

  const textToStream =
    "This is a smooth stream sent from the test script via the local Webhook API to demonstrate InstantDB's Ephemeral Topics!";
  const words = textToStream.split(" ");
  let currentText = "";

  for (let i = 0; i < words.length; i++) {
    currentText += (i === 0 ? "" : " ") + words[i];

    // Simulate natural typing delay (200-500ms)
    const delay = Math.floor(Math.random() * 300) + 200;

    await fetch("http://localhost:8000/ui-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        elementId,
        conversationId,
        type: "stream",
        text: currentText,
        active: true, // true keeps the stream active
        authorId: "bot",
      }),
    });

    console.log(`Streamed: ${currentText}`);
    await new Promise((r) => setTimeout(r, delay));
  }

  // Finalize the stream
  await fetch("http://localhost:8000/ui-update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      elementId,
      conversationId,
      type: "stream",
      text: currentText,
      active: false, // Completes the stream
      authorId: "bot",
    }),
  });

  console.log("Stream complete! Check the UI.");
}

main();
