import { assertEquals, assertFalse } from "@std/assert";
import { FakeTime } from "@std/testing/time";
import type { EncryptedMessage } from "../../protocol/src/clientApi.ts";
import {
  type ConversationActivity,
  conversationKeyQuery,
  conversationsQuery,
  createConversationMessagesStream,
  createConversationSafely,
  type DecryptedMessagesResult,
  decryptKeySafely,
  isConversationPinned,
  makeCreateTypingNotifier,
  makeSubscribeConversationKey,
  makeSubscribeConversationMessagesStream,
  makeSubscribeDecryptedMessages,
  makeSubscribeTypingStates,
  messagesInfiniteQuery,
  pickBestConversation,
  sortConversations,
  typingTtl,
} from "./subscriptions.ts";
import { subscribePaginatedQuery } from "./instant-client.ts";
import {
  encryptSymmetric,
  generateKeyPair,
  generateSymmetricKey,
  sign,
} from "../../protocol/src/crypto.ts";
import { msgToStr } from "../../protocol/src/clientApi.ts";
import { createMemoryPushKeyStore } from "../../protocol/src/pushKeyStore.ts";

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
      (result) => {
        settled.push(result !== null);
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
      (result) => {
        settled.push(result !== null);
        resolve();
      },
    )
  );
  await done;
  assertEquals(settled, [false]);
});

Deno.test("createConversationSafely reports success on a clean result", async () => {
  const settled: ({ id: string } | null)[] = [];
  const done = new Promise<void>((resolve) =>
    createConversationSafely(
      () => Promise.resolve({ id: "convo1" }),
      (result) => {
        settled.push(result);
        resolve();
      },
    )
  );
  await done;
  assertEquals(settled, [{ id: "convo1" }]);
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

Deno.test("getOrCreateConversation accepts title parameter and defaults to unnamed", async () => {
  const code = await Deno.readTextFile("./lit/core/subscriptions.ts");
  assertEquals(code.includes('title = ""'), true);
  assertEquals(code.includes("renameConversation"), true);
});

Deno.test("useGetOrCreateConversation forwards title parameter", async () => {
  const code = await Deno.readTextFile("./lit/react-hooks.ts");
  assertEquals(code.includes("title?: string;"), true);
  assertEquals(code.includes("getOrCreateConversation("), true);
});

Deno.test("conversationsQuery traverses from indexed identity with participant display fields", () => {
  const q = conversationsQuery("pk-self");
  assertEquals(q.identities.$.where, { publicSignKey: "pk-self" });
  assertEquals(
    q.identities.conversations.participants.$.fields,
    ["publicSignKey", "name", "avatar"],
  );
  assertEquals(q.identities.conversations.archivedBy.$.where, {
    publicSignKey: "pk-self",
  });
  assertEquals(q.identities.conversations.pinnedBy.$.where, {
    publicSignKey: "pk-self",
  });
});

Deno.test("sortConversations places pinned conversations first and sorts each group by updatedAt descending", () => {
  const convs = [
    { id: "newest-unpinned", updatedAt: 500, pinnedBy: [] },
    { id: "older-pinned", updatedAt: 100, pinnedBy: [{ publicSignKey: "me" }] },
    { id: "middle-unpinned", updatedAt: 300 },
    { id: "newer-pinned", updatedAt: 200, pinnedBy: [{ publicSignKey: "me" }] },
  ];
  assertEquals(isConversationPinned(convs[0]), false);
  assertEquals(isConversationPinned(convs[1]), true);
  assertEquals(
    sortConversations(convs).map((c) => c.id),
    ["newer-pinned", "older-pinned", "newest-unpinned", "middle-unpinned"],
  );
});

Deno.test("conversationKeyQuery queries keys directly by conversation and owner", () => {
  const q = conversationKeyQuery("convo-1", "pk-self");
  assertEquals(q.keys.$.where, {
    conversation: "convo-1",
    "owner.publicSignKey": "pk-self",
  });
});

Deno.test("createConversationMessagesStream decrypts pre-fetched messages when key arrives without re-subscribing", async () => {
  const { publicKey, privateKey } = await generateKeyPair("sign");
  const symKey = await generateSymmetricKey();
  const makeMsg = async (id: string, text: string, timestamp: number) => {
    const inner = {
      type: "text" as const,
      text,
      conversationId: "convo-1",
      sentAt: timestamp,
    };
    const signature = await sign(privateKey, msgToStr(inner));
    const payload = await encryptSymmetric(symKey, {
      payload: inner,
      publicSignKey: publicKey,
      signature,
    });
    return { id, payload, timestamp };
  };
  const m1 = await makeMsg("m1", "first message", 1000);
  const m2 = await makeMsg("m2", "second message", 2000);

  const tracker: {
    subscribeCalls: number;
    m1PayloadReads: number;
    pushSnapshot: (
      msgs: Array<{ id: string; payload: EncryptedMessage; timestamp: number }>,
    ) => void;
  } = {
    subscribeCalls: 0,
    m1PayloadReads: 0,
    pushSnapshot: () => {},
  };
  const received: DecryptedMessagesResult[] = [];

  const stream = createConversationMessagesStream(
    (_query, cb) => {
      tracker.subscribeCalls++;
      tracker.pushSnapshot = (messages) =>
        cb({ data: { messages }, canLoadNextPage: false });
      return { unsubscribe: () => {}, loadNextPage: () => {} };
    },
  )("convo-1", (res) => received.push(res));

  assertEquals(tracker.subscribeCalls, 1);

  tracker.pushSnapshot([m1]);
  assertEquals(received.at(-1)?.messages, null);

  await stream.setConversationKey(symKey);
  assertEquals(
    tracker.subscribeCalls,
    1,
    "must not tear down and re-subscribe when key arrives",
  );
  assertEquals(received.at(-1)?.messages?.map((m) => m.text), [
    "first message",
  ]);

  const trackedM1 = {
    id: m1.id,
    timestamp: m1.timestamp,
    get payload() {
      tracker.m1PayloadReads++;
      return m1.payload;
    },
  };
  tracker.pushSnapshot([m2, trackedM1]);
  await new Promise((r) => setTimeout(r, 20));
  assertEquals(
    received.at(-1)?.messages?.map((m) => m.text),
    ["second message", "first message"],
  );
  assertEquals(
    tracker.m1PayloadReads,
    0,
    "already-decrypted message by id must hit cache",
  );
  stream.unsubscribe();
});

Deno.test("subscribePaginatedQuery emits full page immediately on first callback even when rows equal limit", () => {
  const queries: Array<{ limit?: number }> = [];
  const callbacks: Array<
    (resp: {
      data?: { messages?: Array<{ id: string }> };
      pageInfo?: { messages?: { hasNextPage?: boolean } };
    }) => void
  > = [];
  const emitted: Array<{ count: number; canLoadNextPage: boolean }> = [];

  const sub = subscribePaginatedQuery(messagesInfiniteQuery("convo-full"))<{
    messages?: Array<{ id: string }>;
  }>(
    (q, cb) => {
      queries.push({ limit: q.messages.$.limit });
      callbacks.push(cb);
      return () => {};
    },
    (resp) => {
      const rows = resp.data?.messages;
      emitted.push({
        count: Array.isArray(rows) ? rows.length : 0,
        canLoadNextPage: resp.canLoadNextPage,
      });
    },
  );

  assertEquals(queries.length, 1);
  assertEquals(queries[0].limit, 100);

  const hundredRows = Array.from({ length: 100 }, (_, i) => ({ id: `m-${i}` }));
  callbacks[0]({
    data: { messages: hundredRows },
    pageInfo: { messages: { hasNextPage: true } },
  });

  assertEquals(
    queries.length,
    1,
    "must not discard starter rows and spawn extra queries",
  );
  assertEquals(emitted, [{ count: 100, canLoadNextPage: true }]);

  sub.loadNextPage();
  assertEquals(queries.length, 2);
  assertEquals(queries[1].limit, 200);
  sub.unsubscribe();
});

Deno.test("createConversationMessagesStream progressively emits newest 20 messages before older history on initial load", async () => {
  const { publicKey, privateKey } = await generateKeyPair("sign");
  const symKey = await generateSymmetricKey();
  const rows = await Promise.all(
    Array.from({ length: 30 }, async (_, idx) => {
      const timestamp = 1000 + idx * 100;
      const inner = {
        type: "text" as const,
        text: `msg-${idx}`,
        conversationId: "convo-prog",
        sentAt: timestamp,
      };
      const signature = await sign(privateKey, msgToStr(inner));
      const payload = await encryptSymmetric(symKey, {
        payload: inner,
        publicSignKey: publicKey,
        signature,
      });
      return { id: `id-${idx}`, payload, timestamp };
    }),
  );

  const emissionLengths: number[] = [];
  const fullLoaded = new Promise<void>((resolve) => {
    const stream = createConversationMessagesStream((_q, cb) => {
      cb({ data: { messages: rows }, canLoadNextPage: false });
      return { unsubscribe: () => {}, loadNextPage: () => {} };
    })(
      "convo-prog",
      (res) => {
        if (!res.messages) return;
        emissionLengths.push(res.messages.length);
        if (res.messages.length === 30) {
          stream.unsubscribe();
          resolve();
        }
      },
      symKey,
    );
  });

  await fullLoaded;
  assertEquals(emissionLengths, [20, 30]);
});

Deno.test("createConversationMessagesStream mergeMessages shows pushed message immediately and survives stale offline cache until WS catches up", async () => {
  const { publicKey, privateKey } = await generateKeyPair("sign");
  const symKey = await generateSymmetricKey();
  const makeMsg = async (id: string, text: string, timestamp: number) => {
    const inner = {
      type: "text" as const,
      text,
      conversationId: "convo-push-merge",
      sentAt: timestamp,
    };
    const signature = await sign(privateKey, msgToStr(inner));
    const payload = await encryptSymmetric(symKey, {
      payload: inner,
      publicSignKey: publicKey,
      signature,
    });
    return { id, payload, timestamp };
  };
  const m1 = await makeMsg("m1", "older cached message", 1000);
  const m2 = await makeMsg("m2", "new pushed reply", 2000);

  const holder: {
    pushSnapshot: (
      msgs: Array<{ id: string; payload: EncryptedMessage; timestamp: number }>,
    ) => void;
  } = { pushSnapshot: () => {} };
  const emissions: string[][] = [];

  const stream = createConversationMessagesStream((_q, cb) => {
    holder.pushSnapshot = (messages) =>
      cb({ data: { messages }, canLoadNextPage: false });
    return { unsubscribe: () => {}, loadNextPage: () => {} };
  })(
    "convo-push-merge",
    (res) => {
      if (res.messages) emissions.push(res.messages.map((m) => m.text));
    },
    symKey,
  );

  stream.mergeMessages([m2]);
  await new Promise((r) => setTimeout(r, 15));
  assertEquals(emissions.at(-1), ["new pushed reply"]);

  // InstantDB offline IndexedDB cache emits stale snapshot without m2
  holder.pushSnapshot([m1]);
  await new Promise((r) => setTimeout(r, 15));
  assertEquals(emissions.at(-1), ["new pushed reply", "older cached message"]);

  // InstantDB live WebSocket catches up with both m2 and m1
  holder.pushSnapshot([m2, m1]);
  await new Promise((r) => setTimeout(r, 15));
  assertEquals(emissions.at(-1), ["new pushed reply", "older cached message"]);

  stream.unsubscribe();
});

Deno.test("opening a notification resolves conversationKey and pushed message from pushKeyStore without waiting for live WebSocket", async () => {
  const keyStore = createMemoryPushKeyStore();
  const [signPair, encPair] = await Promise.all([
    generateKeyPair("sign"),
    generateKeyPair("encrypt"),
  ]);
  const credentials = {
    publicSignKey: signPair.publicKey,
    privateSignKey: signPair.privateKey,
    privateEncryptKey: encPair.privateKey,
  };
  const symKey = await generateSymmetricKey();
  const conversationId = crypto.randomUUID();
  const makeMsg = async (id: string, text: string, timestamp: number) => {
    const inner = {
      type: "text" as const,
      text,
      conversationId,
      sentAt: timestamp,
    };
    const payload = await encryptSymmetric(symKey, {
      payload: inner,
      publicSignKey: signPair.publicKey,
      signature: await sign(signPair.privateKey, msgToStr(inner)),
    });
    return { id, payload, timestamp };
  };
  const pushed = await makeMsg(
    "notif-m1",
    "Instant reply from notification",
    5000,
  );
  const extraBackendMsg = await makeMsg(
    "notif-m2",
    "Follow-up fetched over HTTP",
    6000,
  );

  await keyStore.setConversationKey(conversationId, symKey);
  await keyStore.appendConversationMessage(conversationId, pushed);

  const backendGate = Promise.withResolvers<{
    messages: Array<
      { id: string; payload: EncryptedMessage; timestamp: number }
    >;
    hasMore: boolean;
  }>();

  const subscribeKey = makeSubscribeConversationKey({
    subscribeQuery: () => () => {},
    keyStore,
    canFetchDirect: () => false,
  });
  const subscribeStream = makeSubscribeConversationMessagesStream({
    subscribeInfiniteQuery: () => ({
      unsubscribe: () => {},
      loadNextPage: () => {},
    }),
    keyStore,
    fetchMessages: () => backendGate.promise,
    canFetchDirect: () => true,
    waitForAuth: () => Promise.resolve(),
  });

  const resolvedTexts: string[][] = [];
  const stream = subscribeStream(conversationId, credentials, (res) => {
    if (res.messages && res.messages.length > 0) {
      resolvedTexts.push(res.messages.map((m) => m.text));
    }
  });
  const unsubKey = subscribeKey(conversationId, credentials, (key) => {
    stream.setConversationKey(key);
  });

  await new Promise((r) => setTimeout(r, 20));
  assertEquals(resolvedTexts.at(-1), ["Instant reply from notification"]);

  backendGate.resolve({
    messages: [extraBackendMsg, pushed],
    hasMore: false,
  });
  await new Promise((r) => setTimeout(r, 20));
  assertEquals(resolvedTexts.at(-1), [
    "Follow-up fetched over HTTP",
    "Instant reply from notification",
  ]);

  unsubKey();
  stream.unsubscribe();
});

Deno.test("reconcileAfterSend fetches sent message and instant bot reply when live WebSocket is stalled, and cancels fallback timers when live updates arrive", async () => {
  const keyStore = createMemoryPushKeyStore();
  const [signPair, encPair] = await Promise.all([
    generateKeyPair("sign"),
    generateKeyPair("encrypt"),
  ]);
  const credentials = {
    publicSignKey: signPair.publicKey,
    privateSignKey: signPair.privateKey,
    privateEncryptKey: encPair.privateKey,
  };
  const symKey = await generateSymmetricKey();
  const conversationId = crypto.randomUUID();
  const makeMsg = async (id: string, text: string, timestamp: number) => {
    const inner = {
      type: "text" as const,
      text,
      conversationId,
      sentAt: timestamp,
    };
    const payload = await encryptSymmetric(symKey, {
      payload: inner,
      publicSignKey: signPair.publicKey,
      signature: await sign(signPair.privateKey, msgToStr(inner)),
    });
    return { id, payload, timestamp };
  };
  const initialMsg = await makeMsg("m0", "earlier message", 1000);
  const sentMsg = await makeMsg("m1", ".", 2000);
  const botReply = await makeMsg("m2", "Sigo aquí.", 2500);

  const fetchTracker = {
    count: 0,
    messages: [initialMsg] as Array<{
      id: string;
      payload: EncryptedMessage;
      timestamp: number;
    }>,
  };
  const liveHolder: {
    push: (
      msgs: Array<{ id: string; payload: EncryptedMessage; timestamp: number }>,
    ) => void;
  } = { push: () => {} };

  const subscribeStream = makeSubscribeConversationMessagesStream({
    subscribeInfiniteQuery: (_creds, _query, cb) => {
      liveHolder.push = (messages) =>
        cb({ data: { messages }, canLoadNextPage: false });
      return { unsubscribe: () => {}, loadNextPage: () => {} };
    },
    keyStore,
    fetchMessages: () => {
      fetchTracker.count += 1;
      return Promise.resolve({
        messages: fetchTracker.messages,
        hasMore: false,
      });
    },
    canFetchDirect: () => true,
    waitForAuth: () => Promise.resolve(),
    reconcileDelaysMs: [15, 45],
  });

  const emitted: string[][] = [];
  const stream = subscribeStream(
    conversationId,
    credentials,
    (res) => {
      if (res.messages) emitted.push(res.messages.map((m) => m.text));
    },
    symKey,
  );

  // Initial live snapshot arrives
  liveHolder.push([initialMsg]);
  await new Promise((r) => setTimeout(r, 30));
  assertEquals(emitted.at(-1), ["earlier message"]);

  // Live WebSocket stalls; user sends "." and bot replies instantaneously on backend
  fetchTracker.messages = [botReply, sentMsg, initialMsg];
  const fetchesBeforeSend = fetchTracker.count;
  stream.reconcileAfterSend?.();

  await new Promise((r) => setTimeout(r, 80));
  assertEquals(fetchTracker.count > fetchesBeforeSend, true);
  assertEquals(emitted.at(-1), ["Sigo aquí.", ".", "earlier message"]);

  // When live WebSocket IS healthy and delivers the sent message snapshot, fallback timers cancel with 0 HTTP fetches
  const fetchesBeforeHealthySend = fetchTracker.count;
  stream.reconcileAfterSend?.();
  liveHolder.push([sentMsg, initialMsg]);
  await new Promise((r) => setTimeout(r, 80));
  assertEquals(fetchTracker.count, fetchesBeforeHealthySend);

  stream.unsubscribe();
});
