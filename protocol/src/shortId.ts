import { sha256 } from "@noble/hashes/sha2.js";
import { base64ToBase64Url } from "./crypto.ts";

export const shortIdLength = 12;

export const shortIdFromPublicSignKey = (publicSignKey: string): string =>
  base64ToBase64Url(
    btoa(
      String.fromCharCode(...sha256(new TextEncoder().encode(publicSignKey))),
    ),
  ).slice(0, shortIdLength);
