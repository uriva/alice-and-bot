import { verify } from "../../protocol/src/crypto.ts";
import { canonicalStringForAuthSign } from "./api.ts";

const kv = await Deno.openKv();

const NONCE_TTL_MS = 2 * 60 * 1000;

const nonceKey = (publicSignKey: string, nonce: string) => [
  "nonce",
  publicSignKey,
  nonce,
];

export const issueNonceHelper = async (
  publicSignKey: string,
): Promise<string> => {
  const nonce = crypto.randomUUID();
  await kv.set(nonceKey(publicSignKey, nonce), { createdAt: Date.now() }, {
    expireIn: NONCE_TTL_MS,
  });
  return nonce;
};

export const verifyAuthToken = async <T>({ authToken, ...params }: {
  payload: T;
  publicSignKey: string;
  nonce: string;
  authToken: string;
  action: string;
}): Promise<boolean> => {
  const k = nonceKey(params.publicSignKey, params.nonce);
  const { value } = await kv.get<string>(k);
  if (!value) return false;
  await kv.delete(k);
  return verify(
    authToken,
    params.publicSignKey,
    canonicalStringForAuthSign(params),
  );
};
