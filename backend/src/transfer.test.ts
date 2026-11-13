import { assertEquals } from "@std/assert";
import { endpoints } from "./main.ts";

Deno.test("retrieveTransferPayload deletes payload after first retrieval (one-time link)", async () => {
  const encryptedPayload = "test-encrypted-payload-string";

  const { relayId } = await endpoints.handlers.storeTransferPayload({
    encryptedPayload,
  });

  const retrieve1 = await endpoints.handlers.retrieveTransferPayload({
    relayId,
  });
  assertEquals(retrieve1, { encryptedPayload });

  const retrieve2 = await endpoints.handlers.retrieveTransferPayload({
    relayId,
  });
  assertEquals(retrieve2, { error: "not-found" });
});
