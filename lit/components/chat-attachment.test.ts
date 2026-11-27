import { assertEquals, assertRejects } from "@std/assert";
import { downloadAttachment } from "../../protocol/src/clientApi.ts";
import { generateSymmetricKey } from "../../protocol/src/crypto.ts";
import {
  createAttachmentExpiredError,
  isAttachmentExpiredError,
} from "../../protocol/src/retention.ts";
import {
  decryptAttachmentOutcome,
  decryptAttachmentSafely,
} from "./chat-attachment.ts";

Deno.test("decryptAttachmentSafely returns url on success and reports nothing", async () => {
  const reported: string[] = [];
  const url = await decryptAttachmentSafely(
    () => Promise.resolve("blob:abc"),
    (name) => reported.push(name),
  );
  assertEquals(url, "blob:abc");
  assertEquals(reported, []);
});

Deno.test("decryptAttachmentSafely swallows rejection and reports a named event", async () => {
  const reported: string[] = [];
  const url = await decryptAttachmentSafely(
    () => Promise.reject(new TypeError("Failed to fetch")),
    (name) => reported.push(name),
  );
  assertEquals(url, null);
  assertEquals(reported, ["attachment_decrypt_failed"]);
});

Deno.test("decryptAttachmentOutcome treats expired attachments cleanly without reporting an error", async () => {
  const reported: string[] = [];
  const outcome = await decryptAttachmentOutcome(
    () => Promise.reject(createAttachmentExpiredError(404)),
    (name) => reported.push(name),
  );
  assertEquals(outcome, { status: "expired" });
  assertEquals(reported, []);
});

Deno.test("downloadAttachment throws an expired attachment error when GCS returns 404", async () => {
  const conversationKey = await generateSymmetricKey();
  const err = await assertRejects(() =>
    downloadAttachment({
      url:
        "https://storage.googleapis.com/alice-and-bot-attachments/attachments/nonexistent-retention-test/0000000000000000000000000000000000000000000000000000000000000000.bin",
      conversationKey,
    })
  );
  assertEquals(isAttachmentExpiredError(err), true);
});

Deno.test("chat-attachment renders chat-video-player for video attachments", () => {
  const code = Deno.readTextFileSync(
    new URL("./chat-attachment.ts", import.meta.url).pathname,
  );
  assertEquals(code.includes("<chat-video-player"), true);
});
