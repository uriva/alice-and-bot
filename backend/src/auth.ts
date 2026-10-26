import { verify } from "../../protocol/src/crypto.ts";
import { canonicalStringForAuthSign } from "./api.ts";

const NONCE_TTL_MS = 2 * 60 * 1000;

const nonces = new Map<string, number>();

const nonceKey = (publicSignKey: string, nonce: string) =>
  `${publicSignKey}:${nonce}`;

export const issueNonceHelper = (publicSignKey: string): Promise<string> => {
  const now = Date.now();
  nonces.forEach((expiresAt, k) => {
    if (now > expiresAt) nonces.delete(k);
  });
  const nonce = crypto.randomUUID();
  nonces.set(nonceKey(publicSignKey, nonce), now + NONCE_TTL_MS);
  return Promise.resolve(nonce);
};

export const verifyAuthToken = <T>({ authToken, ...params }: {
  payload: T;
  publicSignKey: string;
  nonce: string;
  authToken: string;
  action: string;
}): Promise<boolean> => {
  const k = nonceKey(params.publicSignKey, params.nonce);
  const expiresAt = nonces.get(k);
  if (!expiresAt || Date.now() > expiresAt) {
    nonces.delete(k);
    return Promise.resolve(false);
  }
  nonces.delete(k);
  return verify(
    authToken,
    params.publicSignKey,
    canonicalStringForAuthSign(params),
  );
};
