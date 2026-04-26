import { assertThrows } from "@std/assert";
import {
  assertTextLengthOk,
  maxEncryptedMessageLength,
  maxTextLength,
} from "./attachmentLimits.ts";
import { encryptSymmetric, generateSymmetricKey } from "./crypto.ts";

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

Deno.test("maxEncryptedMessageLength accommodates maxTextLength of non-ASCII (Hebrew) plaintext after real encryption", async () => {
  const hebrew = "ש".repeat(maxTextLength);
  const key = await generateSymmetricKey();
  const encrypted = await encryptSymmetric(key, {
    payload: { type: "text", text: hebrew },
    publicSignKey: "x".repeat(400),
    signature: "x".repeat(344),
  });
  if (encrypted.length > maxEncryptedMessageLength) {
    throw new Error(
      `encrypted Hebrew payload length ${encrypted.length} exceeds maxEncryptedMessageLength=${maxEncryptedMessageLength}`,
    );
  }
});
