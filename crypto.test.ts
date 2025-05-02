import { decrypt, encryptMessage, generateKeyPair } from "./crypto.ts";
import { assertEquals } from "@std/assert";

Deno.test("crypto", async () => {
  const data = { name: "test" };
  const { privateKey, publicKey } = await generateKeyPair();
  const encrypted = await encryptMessage(publicKey, data);
  const decrypted: { name: string } = await decrypt(privateKey, encrypted);
  assertEquals(decrypted, data);
  // @ts-expect-error check retains typing
  const _: number = decrypted;
});
