import { assertEquals } from "@std/assert";
import {
  type DecipheredMessage,
  decryptMessage,
  type InternalMessage,
  msgToStr,
} from "./clientApi.ts";
import {
  encryptSymmetric,
  generateKeyPair,
  generateSymmetricKey,
  sign,
} from "./crypto.ts";

const seal = async (
  conversationKey: string,
  privateSignKey: string,
  publicSignKey: string,
  message: InternalMessage,
) => {
  // Verification uses msgToStr, so a test has to sign the same bytes.
  const serialized = msgToStr(message);
  return await encryptSymmetric(conversationKey, {
    payload: message,
    publicSignKey,
    signature: await sign(privateSignKey, serialized),
  });
};

// Mirrors what sendMessageWithKey does before handing off to the API, so this
// covers the same serialization the server receives.
const roundTrip = async (message: InternalMessage) => {
  const { publicKey, privateKey } = await generateKeyPair("sign");
  const conversationKey = await generateSymmetricKey();
  const payload = await seal(
    conversationKey,
    privateKey,
    publicKey,
    message,
  );
  const decrypted = await decryptMessage(conversationKey)({
    id: "m1",
    timestamp: 1,
    payload,
  });
  return { decrypted, publicSignKey: publicKey };
};

Deno.test("a canvas event decrypts back to its action and data", async () => {
  const { decrypted } = await roundTrip({
    type: "event",
    action: "cta-clicked",
    data: { plan: "pro", seats: 3 },
  });
  assertEquals(decrypted?.type, "event");
  if (decrypted?.type !== "event") return;
  assertEquals(decrypted.action, "cta-clicked");
  assertEquals(decrypted.data, { plan: "pro", seats: 3 });
  // Never rendered as a chat message, so it carries no text.
  assertEquals(decrypted.text, "");
});

Deno.test("a canvas event carries any JSON shape", async () => {
  const shapes = [
    "a string",
    42,
    true,
    null,
    [1, "two", false],
    { nested: { deep: [1, { x: null }] } },
  ];
  for (const data of shapes) {
    const { decrypted } = await roundTrip({ type: "event", action: "a", data });
    assertEquals(decrypted?.type, "event");
    if (decrypted?.type !== "event") return;
    assertEquals(decrypted.data, data);
  }
});

Deno.test("a canvas event never becomes a text message", async () => {
  const { decrypted } = await roundTrip({
    type: "event",
    action: "a",
    data: "b",
  });
  assertEquals((decrypted as DecipheredMessage).type === "text", false);
});

Deno.test("a text message still round-trips unchanged", async () => {
  const { decrypted } = await roundTrip({ type: "text", text: "hello" });
  assertEquals(decrypted?.type, "text");
  if (decrypted?.type !== "text") return;
  assertEquals(decrypted.text, "hello");
});

Deno.test("a canvas event does not decrypt with the wrong key", async () => {
  const { publicKey, privateKey } = await generateKeyPair("sign");
  const conversationKey = await generateSymmetricKey();
  const payload = await seal(conversationKey, privateKey, publicKey, {
    type: "event",
    action: "a",
    data: "b",
  });
  const other = await generateSymmetricKey();
  const decrypted = await decryptMessage(other)({
    id: "m1",
    timestamp: 1,
    payload,
  });
  assertEquals(decrypted, undefined);
});
