import stringify from "safe-stable-stringify";

export const defaultWebhookServerPublicKey =
  "MCowBQYDK2VwAyEABJDWi/dcXSzFvi4MSthH2bCoU5009eCw9rNtw2NL8sU=";

export const maxWebhookOriginSkewMs = 10 * 60 * 1000;

export type WebhookOriginFields = {
  messageId: string;
  conversationId: string;
  timestamp: number;
  payload: string;
};

const ed25519Algorithm = { name: "Ed25519" };

const base64ToBytes = (base64: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));

const bytesToBase64 = (buffer: ArrayBuffer): string =>
  btoa(
    Array.from(new Uint8Array(buffer), (b) => String.fromCharCode(b)).join(""),
  );

export const canonicalWebhookOriginString = ({
  messageId,
  conversationId,
  timestamp,
  payload,
}: WebhookOriginFields): string =>
  "alice-webhook-v1:" +
  stringify({ messageId, conversationId, timestamp, payload });

export const signWebhookOrigin = async (
  privateKeyPkcs8Base64: string,
  fields: WebhookOriginFields,
): Promise<string> => {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    base64ToBytes(privateKeyPkcs8Base64),
    ed25519Algorithm,
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    ed25519Algorithm,
    key,
    new TextEncoder().encode(canonicalWebhookOriginString(fields)),
  );
  return bytesToBase64(signature);
};

export const verifyWebhookOrigin = (
  whUpdate: WebhookOriginFields & { serverSignature?: string },
  options?: { publicKey?: string; now?: number; maxSkewMs?: number },
): Promise<boolean> => {
  const signature = whUpdate.serverSignature;
  if (
    !signature ||
    !Number.isFinite(whUpdate.timestamp) ||
    Math.abs((options?.now ?? Date.now()) - whUpdate.timestamp) >
      (options?.maxSkewMs ?? maxWebhookOriginSkewMs)
  ) {
    return Promise.resolve(false);
  }
  const publicKey = options?.publicKey ?? defaultWebhookServerPublicKey;
  return Promise.resolve()
    .then(async () => {
      const key = await crypto.subtle.importKey(
        "spki",
        base64ToBytes(publicKey),
        ed25519Algorithm,
        false,
        ["verify"],
      );
      return crypto.subtle.verify(
        ed25519Algorithm,
        key,
        base64ToBytes(signature),
        new TextEncoder().encode(canonicalWebhookOriginString(whUpdate)),
      );
    })
    .then((ok) => ok, () => false);
};

const maxSeenWebhookMessages = 10_000;
const seenWebhookMessages = new Set<string>();

export const claimWebhookMessageOnce = (
  recipientPublicSignKey: string,
  messageId: string,
): boolean => {
  if (!messageId) return true;
  const key = `${recipientPublicSignKey}:${messageId}`;
  if (seenWebhookMessages.has(key)) return false;
  if (seenWebhookMessages.size >= maxSeenWebhookMessages) {
    const oldest = seenWebhookMessages.values().next().value;
    if (oldest !== undefined) seenWebhookMessages.delete(oldest);
  }
  seenWebhookMessages.add(key);
  return true;
};

export const resetSeenWebhookMessages = (): void => {
  seenWebhookMessages.clear();
};
