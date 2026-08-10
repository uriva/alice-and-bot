import { base64ToBase64Url } from "./crypto.ts";

export const shortIdLength = 12;

export const shortIdFromPublicSignKey = async (
  publicSignKey: string,
): Promise<string> => {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(publicSignKey),
  );
  return base64ToBase64Url(
    btoa(String.fromCharCode(...new Uint8Array(hash))),
  ).slice(0, shortIdLength);
};
