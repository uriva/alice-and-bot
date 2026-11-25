import {
  createIdentity,
  type Credentials,
} from "../../protocol/src/clientApi.ts";
import {
  decryptSymmetric,
  type EncryptedSymmetric,
} from "../../protocol/src/crypto.ts";
import { retrieveTransferPayload } from "../../backend/src/api.ts";
import { registerCredentials } from "../../protocol/src/instantAuth.ts";
import { savePushCredentials } from "../../protocol/src/pushKeyStore.ts";

export const isValidCredentials = (value: unknown): value is Credentials =>
  typeof value === "object" &&
  value !== null &&
  "publicSignKey" in value &&
  typeof value.publicSignKey === "string" &&
  value.publicSignKey.length > 0 &&
  "privateSignKey" in value &&
  typeof value.privateSignKey === "string" &&
  value.privateSignKey.length > 0 &&
  "privateEncryptKey" in value &&
  typeof value.privateEncryptKey === "string" &&
  value.privateEncryptKey.length > 0;

export const shouldOverwriteCredentials = (
  existingStored: string | null,
  confirmFn: (message: string) => boolean = (msg) => globalThis.confirm(msg),
): boolean => {
  if (!existingStored) return true;
  return confirmFn(
    "You already have an identity on this device. Importing this transfer link will permanently replace it. Continue?",
  );
};

export const base64UrlToBase64 = (str: string): string => {
  let s = str.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return s;
};

export const parseTransferFragment = (hash: string) => {
  const decoded = decodeURIComponent(hash);
  const match = decoded.match(/^#?transfer=([^:]+):(.+)$/);
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
        const creds = await decryptSymmetric<unknown>(
          parsed.aesKey,
          result.encryptedPayload as EncryptedSymmetric<unknown>,
        );
        if (!isValidCredentials(creds)) {
          throw new Error("Invalid transfer credentials");
        }
        return registerCredentials(creds);
      }
    } catch (e) {
      console.error("Failed to import from URL", e);
    }
  }

  try {
    const creds = JSON.parse(trimmed);
    if (isValidCredentials(creds)) {
      return registerCredentials(creds);
    }
  } catch (e) {
    console.error("Failed to parse credentials JSON", e);
  }

  return null;
};

export const loadCredentials = (key: string): Credentials | null => {
  const stored = localStorage.getItem(key);
  if (!stored) return null;
  const parsed = registerCredentials(JSON.parse(stored));
  savePushCredentials(parsed).catch(() => {});
  return parsed;
};

export const saveCredentials = (
  key: string,
  credentials: Credentials,
): void => {
  registerCredentials(credentials);
  savePushCredentials(credentials).catch(() => {});
  localStorage.setItem(key, JSON.stringify(credentials));
};

export const loadOrCreateCredentials = async (
  name: string | null,
  key: string,
): Promise<Credentials | null> => {
  const existing = loadCredentials(key);
  if (existing) return registerCredentials(existing);
  if (!name) return null;
  const credentials = await createIdentity(name);
  saveCredentials(key, credentials);
  return registerCredentials(credentials);
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
