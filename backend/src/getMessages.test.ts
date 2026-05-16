import { assertEquals } from "@std/assert";
import { backendApiSchema } from "./api.ts";

const validOutput = {
  messages: [
    { id: "msg-1", payload: { ciphertext: "abc", iv: "123" }, timestamp: 1000 },
  ],
  hasMore: false,
};

const validInput = {
  payload: { conversationId: "convo-1" },
  publicSignKey: "pk-1",
  nonce: "nonce-1",
  authToken: "sig-1",
};

Deno.test("getMessages schema accepts valid output", () => {
  const parsed = backendApiSchema.getMessages.output.safeParse(validOutput);
  assertEquals(parsed.success, true);
});

Deno.test("getMessages schema rejects missing conversationId", () => {
  const parsed = backendApiSchema.getMessages.input.safeParse({
    ...validInput,
    payload: {},
  });
  assertEquals(parsed.success, false);
});

Deno.test("getMessages schema accepts input with limit and before", () => {
  const parsed = backendApiSchema.getMessages.input.safeParse({
    ...validInput,
    payload: { conversationId: "convo-1", limit: 10, before: 5000 },
  });
  assertEquals(parsed.success, true);
});

Deno.test("getMessages schema rejects limit over 200", () => {
  const parsed = backendApiSchema.getMessages.input.safeParse({
    ...validInput,
    payload: { conversationId: "convo-1", limit: 201 },
  });
  assertEquals(parsed.success, false);
});

Deno.test("getMessages schema rejects negative limit", () => {
  const parsed = backendApiSchema.getMessages.input.safeParse({
    ...validInput,
    payload: { conversationId: "convo-1", limit: -1 },
  });
  assertEquals(parsed.success, false);
});

Deno.test("getMessages schema has no empty messages array", () => {
  const parsed = backendApiSchema.getMessages.output.safeParse({
    messages: [],
    hasMore: false,
  });
  assertEquals(parsed.success, true);
});
