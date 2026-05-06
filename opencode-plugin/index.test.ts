import { assertEquals } from "@std/assert";
import { reasoningStreamUpdate } from "./reasoning.ts";

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
