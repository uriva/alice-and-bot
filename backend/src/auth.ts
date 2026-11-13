import { verify } from "../../protocol/src/crypto.ts";
import {
  canonicalStringForAuthSign,
  canonicalStringForAuthSignV2,
} from "./api.ts";

const NONCE_TTL_MS = 2 * 60 * 1000;
export const MAX_NONCES = 10_000;

const nonces = new Map<string, number>();

const nonceKey = (publicSignKey: string, nonce: string) =>
  `${publicSignKey}:${nonce}`;

const pruneNonces = (now: number) => {
  nonces.forEach((expiresAt, k) => {
    if (now > expiresAt) nonces.delete(k);
  });
  if (nonces.size >= MAX_NONCES) {
    const excess = nonces.size - MAX_NONCES + 1;
    Array.from(nonces.keys())
      .slice(0, excess)
      .forEach((k) => nonces.delete(k));
  }
};

export const getActiveNoncesCount = (): number => nonces.size;

export const issueNonceHelper = (publicSignKey: string): Promise<string> => {
  const now = Date.now();
  pruneNonces(now);
  const nonce = crypto.randomUUID();
  nonces.set(nonceKey(publicSignKey, nonce), now + NONCE_TTL_MS);
  return Promise.resolve(nonce);
};

const verifySafe = (
  signature: string,
  publicSignKey: string,
  data: string,
): Promise<boolean> =>
  verify(signature, publicSignKey, data).catch(() => false);

export const verifyAuthToken = async <T>({ authToken, ...params }: {
  payload: T;
  publicSignKey: string;
  nonce: string;
  authToken: string;
  action: string;
}): Promise<boolean> => {
  const k = nonceKey(params.publicSignKey, params.nonce);
  const expiresAt = nonces.get(k);
  nonces.delete(k);
  if (!expiresAt || Date.now() > expiresAt) {
    return false;
  }
  const v2 = await canonicalStringForAuthSignV2(params);
  if (await verifySafe(authToken, params.publicSignKey, v2)) return true;
  return verifySafe(
    authToken,
    params.publicSignKey,
    canonicalStringForAuthSign(params),
  );
};
