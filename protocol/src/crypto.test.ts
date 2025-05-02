import { assertEquals } from "@std/assert";
import {
  decrypt,
  decryptSymmetric,
  encrypt,
  encryptSymmetric,
  generateKeyPair,
  generateSymmetricKey,
  sign,
  verify,
} from "./crypto.ts";

Deno.test("encrypt and decrypt symmetric", async () => {
  const data = { name: "test" };
  const symmetricKey = await generateSymmetricKey();
  const encrypted = await encryptSymmetric(symmetricKey, data);
  const decrypted = await decryptSymmetric(symmetricKey, encrypted);
  assertEquals(decrypted, data);
  // @ts-expect-error check retains typing
  const _: number = decrypted;
});

Deno.test("encrypt and decrypt asymmetric", async () => {
  const data = { name: "test" };
  const { privateKey, publicKey } = await generateKeyPair("encrypt");
  const encrypted = await encrypt(publicKey, data);
  const decrypted = await decrypt(privateKey, encrypted);
  assertEquals(decrypted, data);
  // @ts-expect-error check retains typing
  const _: number = decrypted;
});

Deno.test("sign and verify", async () => {
  const message = "hello world";
  const { privateKey, publicKey } = await generateKeyPair("sign");
  const signature = await sign(privateKey, message);
  assertEquals(await verify(signature, publicKey, message), true);
  assertEquals(await verify(signature, publicKey, "wrong message"), false);
});
