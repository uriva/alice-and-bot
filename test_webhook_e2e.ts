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

const db = init({ appId: instantAppId });

async function main() {
  const { conversations } = await adminQuery({
    conversations: { $: { order: { updatedAt: "desc" }, limit: 1 } },
  });

  if (!conversations.length) {
    console.log("No conversations found");
    return;
  }

  const conversationId = conversations[0].id;
  const elementId = "webhook-test-" + Date.now();

  console.log("Listening for streams on conversation:", conversationId);

  const room = db.joinRoom("conversations", conversationId);

  let receivedCount = 0;
  room.subscribeTopic("stream", (event: any) => {
    if (event.elementId === elementId) {
      console.log("Received via webhook:", event.text);
      receivedCount++;
      if (receivedCount === 3) {
        console.log("Success! All webhook chunks received via InstantDB.");
        Deno.exit(0);
      }
    }
  });

  console.log("Subscribed. Waiting for connection...");
  await new Promise((r) => setTimeout(r, 2000)); // give some time to connect

  console.log("Triggering webhook to start streaming...");
  const chunks = ["Hi", " from", " webhook!"];
  let currentText = "";

  for (const chunk of chunks) {
    currentText += chunk;
    const res = await fetch("http://localhost:8000/ui-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        elementId,
        conversationId,
        type: "stream",
        text: currentText,
        active: true,
        authorId: "test-bot",
      }),
    });
    console.log("Webhook response:", await res.json());
    await new Promise((r) => setTimeout(r, 500));
  }
}

main();
