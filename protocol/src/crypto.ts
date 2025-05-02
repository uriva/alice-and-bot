import { Buffer } from "buffer";

export type Encrypted<_T> = string & { readonly __brand: unique symbol };
export type EncryptedSymmetric<_T> = string & {
  readonly __brand: unique symbol;
};

const encryptAlgo = { name: "RSA-OAEP", hash: "SHA-256" };
const signAlgo = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
const publicKeyFormat = "spki";
const privateKeyFormat = "pkcs8";

const aesAlgo = { name: "AES-GCM", length: 256 };
const ivLength = 12; // 96 bits, recommended for GCM

const base64ToUint8Array = (base64: string) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

export const decrypt = async <T>(
  privateKey: string,
  data: Encrypted<T>,
): Promise<T> =>
  JSON.parse(
    new TextDecoder().decode(
      await crypto.subtle.decrypt(
        encryptAlgo,
        await importKey(privateKey, "decrypt"),
        base64ToUint8Array(data),
      ),
    ),
  );

const importKey = (
  key: string,
  usage: "encrypt" | "decrypt" | "sign" | "verify",
) =>
  crypto.subtle.importKey(
    usage === "decrypt" || usage === "sign"
      ? privateKeyFormat
      : publicKeyFormat,
    Buffer.from(key, "base64"),
    usage === "decrypt" || usage === "encrypt" ? encryptAlgo : signAlgo,
    false,
    [usage],
  );

const importSymmetricKey = (key: string, usage: KeyUsage[]) =>
  crypto.subtle.importKey(
    "raw",
    Buffer.from(key, "base64"),
    aesAlgo,
    false,
    usage,
  );

export const encrypt = async <T>(publicKey: string, data: T) =>
  Buffer.from(
    await crypto.subtle.encrypt(
      encryptAlgo,
      await importKey(publicKey, "encrypt"),
      new TextEncoder().encode(JSON.stringify(data)),
    ),
  ).toString("base64") as Encrypted<T>;

const encodeKey = async (key: CryptoKey, format: "spki" | "pkcs8") =>
  btoa(String.fromCharCode(
    ...new Uint8Array(await crypto.subtle.exportKey(format, key)),
  ));

const encodeKeys = async ({ publicKey, privateKey }: CryptoKeyPair) => ({
  publicKey: await encodeKey(publicKey, publicKeyFormat),
  privateKey: await encodeKey(privateKey, privateKeyFormat),
});

export const generateKeyPair = async (usage: "sign" | "encrypt") =>
  encodeKeys(
    await crypto.subtle.generateKey(
      {
        ...usage === "encrypt" ? encryptAlgo : signAlgo,
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
      },
      true,
      usage === "encrypt" ? ["encrypt", "decrypt"] : ["sign", "verify"],
    ),
  );

export const sign = async (privateKey: string, data: string) =>
  Buffer.from(
    await crypto.subtle.sign(
      signAlgo,
      await importKey(privateKey, "sign"),
      new TextEncoder().encode(data),
    ),
  ).toString("base64");

export const verify = async (
  signature: string,
  publicKey: string,
  data: string,
) =>
  crypto.subtle.verify(
    signAlgo,
    await importKey(publicKey, "verify"),
    Buffer.from(signature, "base64"),
    new TextEncoder().encode(data),
  );

export const encryptSymmetric = async <T>(
  key: string,
  data: T,
): Promise<EncryptedSymmetric<T>> => {
  const iv = crypto.getRandomValues(new Uint8Array(ivLength));
  const cryptoKey = await importSymmetricKey(key, ["encrypt"]);
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { ...aesAlgo, iv },
      cryptoKey,
      encoded,
    ),
  );
  // Prepend IV to ciphertext
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv, 0);
  combined.set(ciphertext, iv.length);
  return Buffer.from(combined).toString("base64") as EncryptedSymmetric<T>;
};

export const decryptSymmetric = async <T>(
  key: string,
  data: EncryptedSymmetric<T>,
): Promise<T> => {
  const raw = Buffer.from(data, "base64");
  const iv = raw.subarray(0, ivLength);
  const ciphertext = raw.subarray(ivLength);
  const cryptoKey = await importSymmetricKey(key, ["decrypt"]);
  const decrypted = await crypto.subtle.decrypt(
    { ...aesAlgo, iv },
    cryptoKey,
    ciphertext,
  );
  return JSON.parse(new TextDecoder().decode(decrypted));
};

export const generateSymmetricKey = async (): Promise<string> => {
  const key = await crypto.subtle.generateKey(aesAlgo, true, [
    "encrypt",
    "decrypt",
  ]);
  const raw = await crypto.subtle.exportKey("raw", key);
  return Buffer.from(new Uint8Array(raw)).toString("base64");
};
