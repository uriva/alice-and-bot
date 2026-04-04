import stringify from "safe-stable-stringify";
import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";

const encryptAlgo = { name: "RSA-OAEP", hash: "SHA-256" };
const signAlgo = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
const aesAlgo = { name: "AES-GCM", length: 256 };
const ivLength = 12;

const toBase64 = (buf: ArrayBufferLike) => Buffer.from(buf).toString("base64");

const importRsa = (
  key: string,
  usage: "encrypt" | "decrypt" | "sign" | "verify",
) =>
  globalThis.crypto.subtle.importKey(
    usage === "decrypt" || usage === "sign" ? "pkcs8" : "spki",
    Buffer.from(key, "base64"),
    usage === "decrypt" || usage === "encrypt" ? encryptAlgo : signAlgo,
    false,
    [usage],
  );

const importAes = (key: string, usages: KeyUsage[]) =>
  globalThis.crypto.subtle.importKey(
    "raw",
    Buffer.from(key, "base64"),
    aesAlgo,
    false,
    usages,
  );

const genRsaKeyPair = async (usage: "sign" | "encrypt") => {
  const pair = await globalThis.crypto.subtle.generateKey(
    {
      ...(usage === "encrypt" ? encryptAlgo : signAlgo),
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
    },
    true,
    usage === "encrypt" ? ["encrypt", "decrypt"] : ["sign", "verify"],
  );
  return {
    publicKey: toBase64(
      await globalThis.crypto.subtle.exportKey("spki", pair.publicKey),
    ),
    privateKey: toBase64(
      await globalThis.crypto.subtle.exportKey("pkcs8", pair.privateKey),
    ),
  };
};

const genAesKey = async () => {
  const key = await globalThis.crypto.subtle.generateKey(aesAlgo, true, [
    "encrypt",
    "decrypt",
  ]);
  return toBase64(await globalThis.crypto.subtle.exportKey("raw", key));
};

const encryptAsymmetric = async (
  publicKey: string,
  data: unknown,
): Promise<string> =>
  toBase64(
    await globalThis.crypto.subtle.encrypt(
      encryptAlgo,
      await importRsa(publicKey, "encrypt"),
      new TextEncoder().encode(JSON.stringify(data)),
    ),
  );

const encryptSymmetric = async (
  key: string,
  data: unknown,
): Promise<string> => {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(ivLength));
  const cryptoKey = await importAes(key, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await globalThis.crypto.subtle.encrypt(
      { ...aesAlgo, iv },
      cryptoKey,
      new TextEncoder().encode(JSON.stringify(data)),
    ),
  );
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv);
  combined.set(ciphertext, iv.length);
  return toBase64(combined.buffer);
};

const signData = async (privateKey: string, data: string) =>
  toBase64(
    await globalThis.crypto.subtle.sign(
      signAlgo,
      await importRsa(privateKey, "sign"),
      new TextEncoder().encode(data),
    ),
  );

export type TestCredentials = {
  publicSignKey: string;
  privateSignKey: string;
  publicEncryptKey: string;
  privateEncryptKey: string;
};

export type TestMessage = {
  id: string;
  payload: string;
  timestamp: number;
  text: string;
  senderPublicSignKey: string;
};

export type TestData = {
  alice: TestCredentials;
  bob: TestCredentials;
  conversationKey: string;
  aliceEncryptedKey: string;
  bobEncryptedKey: string;
  conversationId: string;
  aliceIdentityId: string;
  bobIdentityId: string;
  keyId: string;
  messages: TestMessage[];
};

export const makeEncryptedMessage = async (
  conversationKey: string,
  sender: TestCredentials,
  text: string,
): Promise<string> => {
  const message: { type: "text"; text: string } = { type: "text", text };
  const serialized = stringify(message)!;
  const signature = await signData(sender.privateSignKey, serialized);
  return encryptSymmetric(conversationKey, {
    payload: message,
    publicSignKey: sender.publicSignKey,
    signature,
  });
};

export const generateTestData = async (): Promise<TestData> => {
  const [aliceSign, aliceEncrypt, bobSign, bobEncrypt] = await Promise.all([
    genRsaKeyPair("sign"),
    genRsaKeyPair("encrypt"),
    genRsaKeyPair("sign"),
    genRsaKeyPair("encrypt"),
  ]);

  const alice: TestCredentials = {
    publicSignKey: aliceSign.publicKey,
    privateSignKey: aliceSign.privateKey,
    publicEncryptKey: aliceEncrypt.publicKey,
    privateEncryptKey: aliceEncrypt.privateKey,
  };

  const bob: TestCredentials = {
    publicSignKey: bobSign.publicKey,
    privateSignKey: bobSign.privateKey,
    publicEncryptKey: bobEncrypt.publicKey,
    privateEncryptKey: bobEncrypt.privateKey,
  };

  const conversationKey = await genAesKey();
  const [aliceEncryptedKey, bobEncryptedKey] = await Promise.all([
    encryptAsymmetric(alice.publicEncryptKey, conversationKey),
    encryptAsymmetric(bob.publicEncryptKey, conversationKey),
  ]);

  const conversationId = randomUUID();
  const aliceIdentityId = randomUUID();
  const bobIdentityId = randomUUID();
  const keyId = randomUUID();
  const now = Date.now();

  const rawMessages = [
    { text: "Hello from Alice!", sender: alice, minutesAgo: 5 },
    { text: "Hey Alice! How are you?", sender: bob, minutesAgo: 4 },
    { text: "I am great, thanks for asking!", sender: alice, minutesAgo: 3 },
    { text: "What are you working on today?", sender: bob, minutesAgo: 2 },
    { text: "Just building some E2E tests.", sender: alice, minutesAgo: 1 },
  ];

  const messages: TestMessage[] = await Promise.all(
    rawMessages.map(async ({ text, sender, minutesAgo }) => ({
      id: randomUUID(),
      payload: await makeEncryptedMessage(conversationKey, sender, text),
      timestamp: now - minutesAgo * 60_000,
      text,
      senderPublicSignKey: sender.publicSignKey,
    })),
  );

  return {
    alice,
    bob,
    conversationKey,
    aliceEncryptedKey,
    bobEncryptedKey,
    conversationId,
    aliceIdentityId,
    bobIdentityId,
    keyId,
    messages,
  };
};
