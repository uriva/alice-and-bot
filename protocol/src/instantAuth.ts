import type { Credentials } from "./clientApi.ts";

const bytesToHex = (buffer: ArrayBuffer): string =>
  Array.from(
    new Uint8Array(buffer),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");

export const instantEmailFromPublicSignKey = async (
  publicSignKey: string,
): Promise<string> => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(publicSignKey),
  );
  return `${bytesToHex(digest)}@identity.aliceandbot.internal`;
};

const credentialsByPublicSignKey = new Map<string, Credentials>();
const credentialsByConversationKey = new Map<string, Credentials>();

export const registerCredentials = (credentials: Credentials): Credentials => {
  if (credentials?.publicSignKey) {
    credentialsByPublicSignKey.set(credentials.publicSignKey, credentials);
  }
  return credentials;
};

export const lookupRegisteredCredentials = (
  publicSignKey: string,
): Credentials | undefined => credentialsByPublicSignKey.get(publicSignKey);

export const registerConversationKeyCredentials = (
  conversationKey: string,
  credentials: Credentials,
): void => {
  registerCredentials(credentials);
  if (conversationKey) {
    credentialsByConversationKey.set(conversationKey, credentials);
  }
};

export const lookupConversationKeyCredentials = (
  conversationKey: string,
): Credentials | undefined => credentialsByConversationKey.get(conversationKey);
