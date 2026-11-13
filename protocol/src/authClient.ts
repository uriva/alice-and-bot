import {
  canonicalStringForAuthSignV2,
  issueNonce,
} from "../../backend/src/api.ts";
import type { Credentials } from "./clientApi.ts";
import { sign } from "./crypto.ts";

export type SignedRequest<T> = {
  payload: T;
  publicSignKey: string;
  nonce: string;
  authToken: string;
};

export const buildSignedRequest = async <T>(
  credentials: Credentials,
  action: string,
  payload: T,
): Promise<SignedRequest<T>> => {
  const { nonce } = await issueNonce(credentials.publicSignKey);
  const canonical = await canonicalStringForAuthSignV2({
    action,
    publicSignKey: credentials.publicSignKey,
    payload,
    nonce,
  });
  return {
    payload,
    publicSignKey: credentials.publicSignKey,
    nonce,
    authToken: await sign(credentials.privateSignKey, canonical),
  };
};
