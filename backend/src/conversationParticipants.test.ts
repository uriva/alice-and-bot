import { assertEquals } from "@std/assert";
import { conversationHasExactParticipants } from "./conversationParticipants.ts";

const conv = (...keys: string[]) => ({
  participants: keys.map((publicSignKey) => ({ publicSignKey })),
});

Deno.test("matches a conversation with exactly the requested participants", () => {
  assertEquals(
    conversationHasExactParticipants(["a", "b"])(conv("a", "b")),
    true,
  );
  assertEquals(
    conversationHasExactParticipants(["b", "a"])(conv("a", "b")),
    true,
  );
});

Deno.test("rejects a superset (group) and a subset", () => {
  assertEquals(
    conversationHasExactParticipants(["a", "b"])(conv("a", "b", "c")),
    false,
  );
  assertEquals(conversationHasExactParticipants(["a", "b"])(conv("a")), false);
});

// Regression: the old length-equality check broke when a conversation returned
// a duplicated participant row (participants.length !== unique keys), making an
// exact match silently fail and callers create a duplicate conversation.
Deno.test("matches despite duplicated participant rows", () => {
  assertEquals(
    conversationHasExactParticipants(["a", "b"])(conv("a", "b", "b")),
    true,
  );
  assertEquals(
    conversationHasExactParticipants(["a", "b"])(conv("a", "a", "b", "b")),
    true,
  );
});

Deno.test("single requested key matches only a solo-participant conversation", () => {
  assertEquals(conversationHasExactParticipants(["a"])(conv("a")), true);
  assertEquals(conversationHasExactParticipants(["a"])(conv("a", "b")), false);
});
