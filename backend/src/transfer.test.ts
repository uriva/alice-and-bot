import { assertEquals } from "@std/assert";
import { endpoints } from "./main.ts";

Deno.test("retrieveTransferPayload - allows retrieving the payload multiple times before expiry", async () => {
  const encryptedPayload = "test-encrypted-payload-string";

  // Store payload
  const storeResult = await endpoints.handlers.storeTransferPayload({
    encryptedPayload,
  });
  const relayId = storeResult.relayId;

  // Retrieve payload first time
  const retrieve1 = await endpoints.handlers.retrieveTransferPayload({
    relayId,
  });
  assertEquals(retrieve1, { encryptedPayload });

  // Retrieve payload second time (should still exist!)
  const retrieve2 = await endpoints.handlers.retrieveTransferPayload({
    relayId,
  });
  assertEquals(retrieve2, { encryptedPayload });
});
