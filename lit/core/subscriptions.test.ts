import { assertEquals } from "@std/assert";
import { FakeTime } from "@std/testing/time";
import {
  makeCreateTypingNotifier,
  makeSubscribeTypingStates,
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
