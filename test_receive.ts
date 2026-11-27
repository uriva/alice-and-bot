// deno-lint-ignore-file no-explicit-any
import {
  instantApiUri,
  instantAppId,
  instantWebsocketUri,
} from "./protocol/src/clientApi.ts";

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

const db = init({
  appId: instantAppId,
  apiURI: instantApiUri,
  websocketURI: instantWebsocketUri,
});

async function main() {
  const { conversations } = await adminQuery({
    conversations: {
      $: { order: { updatedAt: "desc" }, limit: 1 },
    },
  });

  const conversationId = conversations[0].id;
  console.log("Listening for streams on:", conversationId);

  db.subscribeConnectionStatus((status) => {
    console.log("Connection status:", status);
  });

  const room = db.joinRoom("conversations", conversationId);
  room.subscribeTopic("stream", (event: unknown, _peer: unknown) => {
    console.log("Received event via room.subscribeTopic:", event);
  });

  console.log("Subscribed. Waiting for events...");
}

main();
