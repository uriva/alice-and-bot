import {
  createIdentity,
  type Credentials,
} from "../../protocol/src/clientApi.ts";

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
