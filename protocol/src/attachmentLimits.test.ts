import { assertThrows } from "@std/assert";
import {
  assertTextLengthOk,
  maxEncryptedMessageLength,
  maxTextLength,
} from "./attachmentLimits.ts";

Deno.test("maxTextLength is reasonable for chat messages", () => {
  const underWhatsAppLimit = maxTextLength <= 4096;
  if (!underWhatsAppLimit) {
    throw new Error(
      `maxTextLength=${maxTextLength} exceeds WhatsApp's 4096-char cap`,
    );
  }
});

Deno.test("assertTextLengthOk passes at the limit", () => {
  assertTextLengthOk("x".repeat(maxTextLength));
});

Deno.test("assertTextLengthOk throws above the limit", () => {
  assertThrows(
    () => assertTextLengthOk("x".repeat(maxTextLength + 1)),
    Error,
    "Message exceeds maximum length",
  );
});

Deno.test("maxEncryptedMessageLength accommodates a maxTextLength plaintext after encryption", () => {
  const expectedBase64Size = Math.ceil((maxTextLength + 500) * 4 / 3);
  if (maxEncryptedMessageLength < expectedBase64Size) {
    throw new Error(
      `maxEncryptedMessageLength=${maxEncryptedMessageLength} is smaller than expected encrypted size ${expectedBase64Size}`,
    );
  }
});
