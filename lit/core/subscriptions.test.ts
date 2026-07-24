import { assertEquals, assertFalse } from "@std/assert";
import { FakeTime } from "@std/testing/time";
import type { EncryptedMessage } from "../../protocol/src/clientApi.ts";
import {
  type ConversationActivity,
  createConversationSafely,
  type DecryptedMessagesResult,
  decryptKeySafely,
  makeCreateTypingNotifier,
  makeSubscribeDecryptedMessages,
  makeSubscribeTypingStates,
  messagesInfiniteQuery,
  pickBestConversation,
  typingTtl,
} from "./subscriptions.ts";

type TypingState = {
  owner?: { publicSignKey?: string; name?: string };
  updatedAt?: number;
};

type DbCallback = (result: { data?: { typingStates?: TypingState[] } }) => void;

const fakeSubscribeQuery = (captureCallback: (cb: DbCallback) => void) =>
(
  _query: Record<string, unknown>,
  cb: DbCallback,
) => {
  captureCallback(cb);
  return () => {};
};

Deno.test("typing indicator clears after TTL without new DB events", () => {
  const time = new FakeTime();
  try {
    const received: string[][] = [];
    let dbCallback!: DbCallback;
    const { unsub } = makeSubscribeTypingStates(
      fakeSubscribeQuery((cb) => dbCallback = cb),
    )("convo1", "selfKey", (names) => received.push([...names]));

    dbCallback({
      data: {
        typingStates: [{
          owner: { publicSignKey: "otherKey", name: "Alice" },
          updatedAt: Date.now(),
        }],
      },
    });
    assertEquals(received.at(-1), ["Alice"]);

    time.tick(typingTtl + 5000);

    assertEquals(received.at(-1), []);
    unsub();
  } finally {
    time.restore();
  }
});

Deno.test("typing indicator shows immediately on fresh DB event", () => {
  const time = new FakeTime();
  try {
    const received: string[][] = [];
    let dbCallback!: DbCallback;
    const { unsub } = makeSubscribeTypingStates(
      fakeSubscribeQuery((cb) => dbCallback = cb),
    )("convo1", "selfKey", (names) => received.push([...names]));

    dbCallback({
      data: {
        typingStates: [{
          owner: { publicSignKey: "otherKey", name: "Bob" },
          updatedAt: Date.now(),
        }],
      },
    });
    assertEquals(received.at(-1), ["Bob"]);
    unsub();
  } finally {
    time.restore();
  }
});

Deno.test("typing indicator excludes self", () => {
  const time = new FakeTime();
  try {
    const received: string[][] = [];
    let dbCallback!: DbCallback;
    const { unsub } = makeSubscribeTypingStates(
      fakeSubscribeQuery((cb) => dbCallback = cb),
    )("convo1", "selfKey", (names) => received.push([...names]));

    dbCallback({
      data: {
        typingStates: [{
          owner: { publicSignKey: "selfKey", name: "Me" },
          updatedAt: Date.now(),
        }],
      },
    });
    assertEquals(received.at(-1), []);
    unsub();
  } finally {
    time.restore();
  }
});

Deno.test("typing indicator clears when updatedAt is set to 0 (isTyping: false)", () => {
  const time = new FakeTime();
  try {
    const received: string[][] = [];
    let dbCallback!: DbCallback;
    const { unsub } = makeSubscribeTypingStates(
      fakeSubscribeQuery((cb) => dbCallback = cb),
    )("convo1", "selfKey", (names) => received.push([...names]));

    dbCallback({
      data: {
        typingStates: [{
          owner: { publicSignKey: "otherKey", name: "Tomer" },
          updatedAt: Date.now(),
        }],
      },
    });
    assertEquals(received.at(-1), ["Tomer"]);

    dbCallback({
      data: {
        typingStates: [{
          owner: { publicSignKey: "otherKey", name: "Tomer" },
          updatedAt: 0,
        }],
      },
    });
    assertEquals(received.at(-1), []);
    unsub();
  } finally {
    time.restore();
  }
});

Deno.test("typing indicator clears when typingStates record is deleted", () => {
  const time = new FakeTime();
  try {
    const received: string[][] = [];
    let dbCallback!: DbCallback;
    const { unsub } = makeSubscribeTypingStates(
      fakeSubscribeQuery((cb) => dbCallback = cb),
    )("convo1", "selfKey", (names) => received.push([...names]));

    dbCallback({
      data: {
        typingStates: [{
          owner: { publicSignKey: "otherKey", name: "Tomer" },
          updatedAt: Date.now(),
        }],
      },
    });
    assertEquals(received.at(-1), ["Tomer"]);

    dbCallback({ data: { typingStates: [] } });
    assertEquals(received.at(-1), []);
    unsub();
  } finally {
    time.restore();
  }
});

Deno.test("typing indicator stays visible while DB keeps refreshing updatedAt", () => {
  const time = new FakeTime();
  try {
    const received: string[][] = [];
    let dbCallback!: DbCallback;
    const { unsub } = makeSubscribeTypingStates(
      fakeSubscribeQuery((cb) => dbCallback = cb),
    )("convo1", "selfKey", (names) => received.push([...names]));

    dbCallback({
      data: {
        typingStates: [{
          owner: { publicSignKey: "otherKey", name: "Tomer" },
          updatedAt: Date.now(),
        }],
      },
    });
    assertEquals(received.at(-1), ["Tomer"]);

    time.tick(15000);
    dbCallback({
      data: {
        typingStates: [{
          owner: { publicSignKey: "otherKey", name: "Tomer" },
          updatedAt: Date.now(),
        }],
      },
    });
    assertEquals(received.at(-1), ["Tomer"]);

    time.tick(typingTtl + 5000);
    assertEquals(received.at(-1), []);
    unsub();
  } finally {
    time.restore();
  }
});

Deno.test("unsubscribe stops interval emissions", () => {
  const time = new FakeTime();
  try {
    const received: string[][] = [];
    let dbCallback!: DbCallback;
    const { unsub } = makeSubscribeTypingStates(
      fakeSubscribeQuery((cb) => dbCallback = cb),
    )("convo1", "selfKey", (names) => received.push([...names]));

    dbCallback({
      data: {
        typingStates: [{
          owner: { publicSignKey: "otherKey", name: "Alice" },
          updatedAt: Date.now(),
        }],
      },
    });
    const countAfterEmit = received.length;
    unsub();

    time.tick(10000);
    assertEquals(received.length, countAfterEmit);
  } finally {
    time.restore();
  }
});

Deno.test("suppressAuthor prevents re-emission on interval tick", () => {
  const time = new FakeTime();
  try {
    const received: string[][] = [];
    let dbCallback!: DbCallback;
    const { unsub, suppressAuthor } = makeSubscribeTypingStates(
      fakeSubscribeQuery((cb) => dbCallback = cb),
    )("convo1", "selfKey", (names) => received.push([...names]));

    dbCallback({
      data: {
        typingStates: [{
          owner: { publicSignKey: "otherKey", name: "Alice" },
          updatedAt: Date.now(),
        }],
      },
    });
    assertEquals(received.at(-1), ["Alice"]);

    suppressAuthor("otherKey");
    time.tick(5000);
    assertEquals(received.at(-1), []);

    unsub();
  } finally {
    time.restore();
  }
});

Deno.test("suppressAuthor clears when newer typing event arrives", () => {
  const time = new FakeTime();
  try {
    const received: string[][] = [];
    let dbCallback!: DbCallback;
    const { unsub, suppressAuthor } = makeSubscribeTypingStates(
      fakeSubscribeQuery((cb) => dbCallback = cb),
    )("convo1", "selfKey", (names) => received.push([...names]));

    const firstTypingTime = Date.now();
    dbCallback({
      data: {
        typingStates: [{
          owner: { publicSignKey: "otherKey", name: "Alice" },
          updatedAt: firstTypingTime,
        }],
      },
    });
    assertEquals(received.at(-1), ["Alice"]);

    suppressAuthor("otherKey");
    time.tick(5000);
    assertEquals(received.at(-1), []);

    time.tick(1000);
    dbCallback({
      data: {
        typingStates: [{
          owner: { publicSignKey: "otherKey", name: "Alice" },
          updatedAt: Date.now(),
        }],
      },
    });
    assertEquals(received.at(-1), ["Alice"]);

    unsub();
  } finally {
    time.restore();
  }
});

Deno.test("suppressAuthor emits immediately to clear indicator", () => {
  const time = new FakeTime();
  try {
    const received: string[][] = [];
    let dbCallback!: DbCallback;
    const { unsub, suppressAuthor } = makeSubscribeTypingStates(
      fakeSubscribeQuery((cb) => dbCallback = cb),
    )("convo1", "selfKey", (names) => received.push([...names]));

    dbCallback({
      data: {
        typingStates: [{
          owner: { publicSignKey: "otherKey", name: "Alice" },
          updatedAt: Date.now(),
        }],
      },
    });
    assertEquals(received.at(-1), ["Alice"]);

    suppressAuthor("otherKey");
    assertEquals(received.at(-1), []);

    unsub();
  } finally {
    time.restore();
  }
});

Deno.test("onInput after onBlurOrSend does not re-send isTyping: true", () => {
  const time = new FakeTime();
  try {
    const calls: boolean[] = [];
    const fakeSendTyping = (
      params: {
        conversation: string;
        isTyping: boolean;
        publicSignKey: string;
      },
    ) => {
      calls.push(params.isTyping);
      return Promise.resolve();
    };
    const notifier = makeCreateTypingNotifier(fakeSendTyping)(
      "convo1",
      "selfKey",
    );

    notifier.onInput();
    assertEquals(calls, [true]);

    notifier.onBlurOrSend();
    assertEquals(calls, [true, false]);

    notifier.onInput();
    assertEquals(calls, [true, false], "onInput after send should not notify");

    notifier.onInput();
    assertEquals(
      calls,
      [true, false, true],
      "second onInput resumes typing normally",
    );
  } finally {
    time.restore();
  }
});

// Regression: getOrCreateConversation's createConversation().then() had no
// .catch(), so a rejected fetch (e.g. blocked backend / offline) escaped as an
// unhandled promise rejection, surfacing as a page error and tearing down the
// builder-chat tree. createConversationSafely must swallow rejections and
// report a failed creation so the caller can retry.
Deno.test("createConversationSafely does not leak a rejected create promise", async () => {
  const settled: boolean[] = [];
  const done = new Promise<void>((resolve) =>
    createConversationSafely(
      () => Promise.reject(new TypeError("Failed to fetch")),
      (created) => {
        settled.push(created);
        resolve();
      },
    )
  );
  await done;
  assertEquals(settled, [false]);
});

Deno.test("createConversationSafely reports failure when result carries an error", async () => {
  const settled: boolean[] = [];
  const done = new Promise<void>((resolve) =>
    createConversationSafely(
      () => Promise.resolve({ error: "boom" }),
      (created) => {
        settled.push(created);
        resolve();
      },
    )
  );
  await done;
  assertEquals(settled, [false]);
});

Deno.test("createConversationSafely reports success on a clean result", async () => {
  const settled: boolean[] = [];
  const done = new Promise<void>((resolve) =>
    createConversationSafely(
      () => Promise.resolve({ id: "convo1" }),
      (created) => {
        settled.push(created);
        resolve();
      },
    )
  );
  await done;
  assertEquals(settled, [true]);
});

// Regression: subscribeConversationKey did decryptAsymmetric(...).then(onChange)
// with no .catch, so a bad/rotated key rejected on every subscription tick and
// escaped as an unhandled promise rejection. decryptKeySafely must swallow the
// rejection and report a named event.
//
// It must NOT emit onChange(null) on failure: nulling the key wipes the
// already-decrypted conversation key downstream, which drops the entire visible
// message history (a transient/spurious decrypt tick would blank the chat). A
// failed decrypt of an existing key leaves the last good key in place; the
// genuine "no key" case is handled separately by the !encryptedKey branch.
Deno.test("decryptKeySafely reports failure without emitting on rejection", async () => {
  const changes: (string | null)[] = [];
  const reported: string[] = [];
  await decryptKeySafely(
    () => Promise.reject(new Error("bad key")),
    (key) => changes.push(key),
    (name) => reported.push(name),
  );
  assertEquals(changes, []);
  assertEquals(reported, ["conversation_key_decrypt_failed"]);
});

Deno.test("decryptKeySafely emits the key on success without reporting", async () => {
  const changes: (string | null)[] = [];
  const reported: string[] = [];
  await decryptKeySafely(
    () => Promise.resolve("plainkey"),
    (key) => changes.push(key),
    (name) => reported.push(name),
  );
  assertEquals(changes, ["plainkey"]);
  assertEquals(reported, []);
});

Deno.test("messages query does not join the conversation entity", () => {
  const query = messagesInfiniteQuery("convo1");
  assertFalse(
    "conversation" in query.messages,
    "joining conversation re-fires the query on every updatedAt bump and times out handle-receive",
  );
  assertEquals(query.messages.$.where, { conversation: "convo1" });
  assertEquals(query.messages.$.order, { timestamp: "desc" });
  assertEquals(query.messages.$.limit, 100);
});

Deno.test("subscribeDecryptedMessages subscribes without a conversation join", () => {
  let joinedConversation = true;
  const subscribe = makeSubscribeDecryptedMessages((query, _cb) => {
    joinedConversation = "conversation" in query.messages;
    return { unsubscribe: () => {}, loadNextPage: () => {} };
  });
  subscribe("convo1", null, () => {});
  assertFalse(joinedConversation);
});

Deno.test("subscribeDecryptedMessages forwards canLoadMore with null messages when key missing", () => {
  const received: DecryptedMessagesResult[] = [];
  const subscribe = makeSubscribeDecryptedMessages((_query, cb) => {
    cb({ data: { messages: [] }, canLoadNextPage: true });
    return { unsubscribe: () => {}, loadNextPage: () => {} };
  });
  subscribe("convo1", null, (result) => received.push(result));
  assertEquals(received.at(-1)?.messages, null);
  assertEquals(received.at(-1)?.canLoadMore, true);
});

Deno.test("subscribeDecryptedMessages handles decryption failure gracefully", async () => {
  const received: DecryptedMessagesResult[] = [];
  const subscribe = makeSubscribeDecryptedMessages((_query, cb) => {
    cb({
      data: {
        messages: [
          {
            id: "msg-bad",
            payload: "invalid-ciphertext-base64-garbage" as EncryptedMessage,
            timestamp: Date.now(),
          } as unknown as {
            id: string;
            payload: EncryptedMessage;
            timestamp: number;
          },
        ],
      },
      canLoadNextPage: false,
    });
    return { unsubscribe: () => {}, loadNextPage: () => {} };
  });

  const promise = new Promise<void>((resolve) => {
    subscribe("convo1", "someSymmetricKeyBase64=", (result) => {
      received.push(result);
      resolve();
    });
  });

  await promise;
  assertEquals(received.at(-1)?.messages, []);
});

Deno.test("subscribeDecryptedMessages handles decryption promise rejection gracefully without unhandled rejection", async () => {
  const received: DecryptedMessagesResult[] = [];
  const badMessages = [{
    id: "msg-bad",
    get payload(): EncryptedMessage {
      throw new Error("Corrupted payload structure");
    },
    timestamp: Date.now(),
  }];
  const subscribe = makeSubscribeDecryptedMessages((_query, cb) => {
    cb({
      data: { messages: badMessages as unknown as never },
      canLoadNextPage: false,
    });
    return { unsubscribe: () => {}, loadNextPage: () => {} };
  });

  const promise = new Promise<void>((resolve) => {
    subscribe("convo1", "key", (result) => {
      received.push(result);
      resolve();
    });
  });

  await promise;
  assertEquals(received.at(-1)?.messages, null);
});

// Regression: a user can have two conversations with the identical participant
// set (e.g. an admin/system task spawned a second {user, bot} conversation).
// getOrCreateConversation used .find() (first / most-recently-touched match),
// which landed on the EMPTY duplicate and hid the real message history behind
// the "Ready to build your bot?" empty state. pickBestConversation must prefer
// the conversation that actually has messages.
const activityMap = (m: Record<string, ConversationActivity>) => (id: string) =>
  m[id];

Deno.test("pickBestConversation prefers the conversation with messages over an empty newer one", () => {
  const real = { id: "real", updatedAt: 100 };
  const emptyNewer = { id: "empty", updatedAt: 999 };
  const best = pickBestConversation(
    [emptyNewer, real],
    activityMap({
      real: { hasMessages: true, lastMessageAt: 50 },
      empty: { hasMessages: false, lastMessageAt: 0 },
    }),
  );
  assertEquals(best?.id, "real");
});

Deno.test("pickBestConversation prefers the most recent last message among non-empty", () => {
  const older = { id: "older", updatedAt: 10 };
  const newer = { id: "newer", updatedAt: 5 };
  const best = pickBestConversation(
    [older, newer],
    activityMap({
      older: { hasMessages: true, lastMessageAt: 100 },
      newer: { hasMessages: true, lastMessageAt: 200 },
    }),
  );
  assertEquals(best?.id, "newer");
});

Deno.test("pickBestConversation falls back to updatedAt when activity is unknown", () => {
  const a = { id: "a", updatedAt: 1 };
  const b = { id: "b", updatedAt: 2 };
  const best = pickBestConversation([a, b], () => undefined);
  assertEquals(best?.id, "b");
});

Deno.test("pickBestConversation returns the sole candidate unchanged", () => {
  const only = { id: "only", updatedAt: 1 };
  assertEquals(pickBestConversation([only], () => undefined)?.id, "only");
  assertEquals(pickBestConversation([], () => undefined), undefined);
});
