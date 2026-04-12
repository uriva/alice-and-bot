import { assertEquals } from "@std/assert";
import { FakeTime } from "@std/testing/time";
import { makeSubscribeTypingStates, typingTtl } from "./subscriptions.ts";

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
    const unsub = makeSubscribeTypingStates(
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
    const unsub = makeSubscribeTypingStates(
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
    const unsub = makeSubscribeTypingStates(
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

Deno.test("unsubscribe stops interval emissions", () => {
  const time = new FakeTime();
  try {
    const received: string[][] = [];
    let dbCallback!: DbCallback;
    const unsub = makeSubscribeTypingStates(
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
