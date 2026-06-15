import { assertEquals } from "@std/assert";

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
