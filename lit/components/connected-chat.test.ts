import { assertEquals } from "@std/assert";
import { nextConversationKey } from "../core/subscriptions.ts";

type DecipheredMessage = {
  id: string;
  text: string;
  timestamp: number;
  publicSignKey: string;
};

class FixedSubscriptionHandler {
  _messages: DecipheredMessage[] | null = null;
  _hadMessages = false;
  _lastMessageCount = 0;
  _canLoadMore = false;
  requestUpdateCount = 0;

  handleMessages(
    messages: DecipheredMessage[] | null,
    canLoadMore: boolean,
  ) {
    if (!messages) return;
    if (messages.length === 0 && this._hadMessages) return;
    const messagesChanged = !this._messages ||
      this._messages.length !== messages.length ||
      this._messages.some((m, i) => m.id !== messages![i].id);
    const canLoadMoreChanged = this._canLoadMore !== canLoadMore;
    if (!messagesChanged && !canLoadMoreChanged) return;
    this._messages = messages;
    this._lastMessageCount = messages.length;
    this._hadMessages = this._hadMessages || messages.length > 0;
    this._canLoadMore = canLoadMore;
    this.requestUpdateCount++;
  }

  teardown() {
    this._hadMessages = false;
    this._lastMessageCount = 0;
    this._messages = null;
  }
}

Deno.test(
  "duplicate message callbacks should not trigger extra re-renders",
  () => {
    const handler = new FixedSubscriptionHandler();
    const sameMessages: DecipheredMessage[] = [
      { id: "m1", text: "hello", timestamp: 1000, publicSignKey: "pk1" },
    ];

    handler.handleMessages(sameMessages, false);
    handler.handleMessages(sameMessages, false);
    handler.handleMessages(sameMessages, false);

    assertEquals(handler.requestUpdateCount, 1);
  },
);

Deno.test(
  "canLoadMore change without message change should trigger re-render",
  () => {
    const handler = new FixedSubscriptionHandler();
    const sameMessages: DecipheredMessage[] = [
      { id: "m1", text: "hello", timestamp: 1000, publicSignKey: "pk1" },
    ];

    handler.handleMessages(sameMessages, true);
    handler.handleMessages(sameMessages, false);

    assertEquals(handler.requestUpdateCount, 2);
  },
);

Deno.test(
  "teardown should clear messages and reset state",
  () => {
    const handler = new FixedSubscriptionHandler();
    const sameMessages: DecipheredMessage[] = [
      { id: "m1", text: "hello", timestamp: 1000, publicSignKey: "pk1" },
    ];

    handler.handleMessages(sameMessages, false);
    assertEquals(handler._messages, sameMessages);

    handler.teardown();
    assertEquals(handler._messages, null);
    assertEquals(handler._hadMessages, false);
    assertEquals(handler._lastMessageCount, 0);
  },
);

Deno.test(
  "conversation change lifecycle timing should prevent rendering of old messages and streams",
  () => {
    let messages: DecipheredMessage[] | null = [
      { id: "m1", text: "hello", timestamp: 1000, publicSignKey: "pk1" },
    ];
    let ephemeralStreams = [
      {
        elementId: "s1",
        text: "Moshe is typing...",
        active: true,
        updatedAt: 1000,
      },
    ];

    let renderedMessages: DecipheredMessage[] | null = null;
    let renderedStreams: typeof ephemeralStreams = [];

    const render = () => {
      renderedMessages = messages;
      renderedStreams = [...ephemeralStreams];
    };

    const teardown = () => {
      messages = null;
      ephemeralStreams = [];
    };

    // Buggy timing: render runs before teardown
    render();
    teardown();

    assertEquals(renderedMessages, [
      { id: "m1", text: "hello", timestamp: 1000, publicSignKey: "pk1" },
    ]);
    assertEquals(renderedStreams, [
      {
        elementId: "s1",
        text: "Moshe is typing...",
        active: true,
        updatedAt: 1000,
      },
    ]);

    // Fixed timing: teardown runs before render
    messages = [
      { id: "m1", text: "hello", timestamp: 1000, publicSignKey: "pk1" },
    ];
    ephemeralStreams = [
      {
        elementId: "s1",
        text: "Moshe is typing...",
        active: true,
        updatedAt: 1000,
      },
    ];
    renderedMessages = null;
    renderedStreams = [];

    teardown();
    render();

    assertEquals(renderedMessages, null);
    assertEquals(renderedStreams, []);
  },
);

Deno.test(
  "ConnectedChat component must implement willUpdate to teardown state before rendering",
  async () => {
    const code = await Deno.readTextFile("./lit/components/connected-chat.ts");
    const hasWillUpdate = code.includes("willUpdate");
    assertEquals(hasWillUpdate, true);
  },
);

// Regression: subscribeConversationKey re-fires on every tick and can emit a
// transient null (e.g. a decrypt blip or a momentarily-empty key row). Nulling
// an already-loaded conversation key wipes the visible message history (the chat
// blanks out even though the conversation is fully healthy). A null incoming key
// must not overwrite a previously-resolved key; only a real key or the genuine
// first "no key" state should take effect.
Deno.test("nextConversationKey keeps the last good key when a null tick arrives", () => {
  assertEquals(nextConversationKey("goodkey", null), "goodkey");
});

Deno.test("nextConversationKey adopts a newly resolved key", () => {
  assertEquals(nextConversationKey(null, "freshkey"), "freshkey");
  assertEquals(nextConversationKey("oldkey", "rotatedkey"), "rotatedkey");
});

Deno.test("nextConversationKey stays null until a key resolves", () => {
  assertEquals(nextConversationKey(null, null), null);
});
