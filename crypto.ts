import { Buffer } from "buffer";

export type Encrypted<_T> = string & { readonly __brand: unique symbol };

const algorithm = { name: "RSA-OAEP", hash: "SHA-256" };
const publicKeytFormat = "spki";
const privateKeytFormat = "pkcs8";

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
        algorithm,
        await importDecryptKey(privateKey),
        base64ToUint8Array(data),
      ),
    ),
  );

const importDecryptKey = (privateKey: string) =>
  crypto.subtle.importKey(
    privateKeytFormat,
    base64ToUint8Array(privateKey),
    algorithm,
    false,
    ["decrypt"],
  );

const importEncryptKey = (publicKey: string) =>
  crypto.subtle.importKey(
    publicKeytFormat,
    base64ToUint8Array(publicKey),
    algorithm,
    false,
    ["encrypt"],
  );

export const encryptMessage = async <T>(
  publicKey: string,
  data: T,
): Promise<Encrypted<T>> =>
  Buffer.from(
    await crypto.subtle.encrypt(
      algorithm,
      await importEncryptKey(publicKey),
      new TextEncoder().encode(JSON.stringify(data)),
    ),
  ).toString("base64") as Encrypted<T>;

export const generateKeyPair = async () => {
  const { publicKey, privateKey } = await crypto.subtle.generateKey(
    {
      ...algorithm,
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
    },
    true,
    ["encrypt", "decrypt"],
  );
  return {
    publicKey: btoa(
      String.fromCharCode(
        ...new Uint8Array(
          await crypto.subtle.exportKey(publicKeytFormat, publicKey),
        ),
      ),
    ),
    privateKey: btoa(
      String.fromCharCode(
        ...new Uint8Array(
          await crypto.subtle.exportKey(privateKeytFormat, privateKey),
        ),
      ),
    ),
  };
};
