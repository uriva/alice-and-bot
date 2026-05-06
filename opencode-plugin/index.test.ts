import { assertEquals } from "@std/assert";
import { reasoningStreamUpdate } from "./reasoning.ts";
import { isWebhookEnvelope } from "./relay.ts";

Deno.test("reasoningStreamUpdate turns reasoning into transient stream updates", () => {
  assertEquals(
    reasoningStreamUpdate({
      conversationId: "conversation-1",
      part: {
        id: "part-1",
        type: "reasoning",
        text: "thinking aloud",
        time: { end: 1 },
      },
      publicSignKey: "bot-key",
    }),
    {
      active: false,
      authorId: "bot-key",
      conversationId: "conversation-1",
      elementId: "opencode-reasoning-part-1",
      text: "thinking aloud",
      type: "stream",
    },
  );
});

Deno.test("isWebhookEnvelope ignores relay pong messages", () => {
  assertEquals(isWebhookEnvelope({ type: "pong" }), false);
});

Deno.test("isWebhookEnvelope accepts encrypted message envelopes", () => {
  assertEquals(
    isWebhookEnvelope({
      conversationId: "conversation-1",
      messageId: "message-1",
      payload: "ciphertext",
    }),
    true,
  );
});
