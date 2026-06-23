import {
  createIdentity,
  type Credentials,
} from "../../protocol/src/clientApi.ts";
import {
  decryptSymmetric,
  type EncryptedSymmetric,
} from "../../protocol/src/crypto.ts";
import { retrieveTransferPayload } from "../../backend/src/api.ts";

export const base64UrlToBase64 = (str: string): string => {
  let s = str.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return s;
};

export const parseTransferFragment = (hash: string) => {
  const match = hash.match(/^#?transfer=([^:]+):(.+)$/);
  if (!match) return null;
  return { relayId: match[1], aesKey: base64UrlToBase64(match[2]) };
};

export const importIdentity = async (
  inputStr: string,
): Promise<Credentials | null> => {
  const trimmed = inputStr.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const url = new URL(trimmed);
      const parsed = parseTransferFragment(url.hash);
      if (parsed) {
        let result = await retrieveTransferPayload(parsed.relayId);
        if ("error" in result) {
          await new Promise((resolve) => setTimeout(resolve, 300));
          result = await retrieveTransferPayload(parsed.relayId);
        }
        if ("error" in result) {
          await new Promise((resolve) => setTimeout(resolve, 700));
          result = await retrieveTransferPayload(parsed.relayId);
        }
        if ("error" in result) {
          throw new Error("Transfer payload not found or expired");
        }
        const creds = await decryptSymmetric<Credentials>(
          parsed.aesKey,
          result.encryptedPayload as EncryptedSymmetric<Credentials>,
        );
        return creds;
      }
    } catch (e) {
      console.error("Failed to import from URL", e);
    }
  }

  try {
    const creds = JSON.parse(trimmed);
    if (
      creds && typeof creds === "object" && creds.privateSignKey &&
      creds.privateEncryptKey
    ) {
      return creds as Credentials;
    }
  } catch (e) {
    console.error("Failed to parse credentials JSON", e);
  }

  return null;
};

export const loadCredentials = (key: string): Credentials | null => {
  const stored = localStorage.getItem(key);
  return stored ? JSON.parse(stored) : null;
};

export const saveCredentials = (key: string, credentials: Credentials): void =>
  localStorage.setItem(key, JSON.stringify(credentials));

export const loadOrCreateCredentials = async (
  name: string | null,
  key: string,
): Promise<Credentials | null> => {
  const existing = loadCredentials(key);
  if (existing) return existing;
  if (!name) return null;
  const credentials = await createIdentity(name);
  saveCredentials(key, credentials);
  return credentials;
};

export const getCredentialsToCopy = (
  key: string,
  inMemory: Credentials | null,
): string | null => {
  const stored = localStorage.getItem(key);
  if (stored) return stored;
  if (inMemory) return JSON.stringify(inMemory);
  return null;
};
