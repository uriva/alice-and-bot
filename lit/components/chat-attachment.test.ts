import { assertEquals } from "@std/assert";
import { decryptAttachmentSafely } from "./chat-attachment.ts";

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

Deno.test("chat-attachment renders chat-video-player for video attachments", () => {
  const code = Deno.readTextFileSync(
    new URL("./chat-attachment.ts", import.meta.url).pathname,
  );
  assertEquals(code.includes("<chat-video-player"), true);
});
