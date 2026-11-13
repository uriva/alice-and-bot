import { Buffer } from "node:buffer";
import { timingSafeEqual } from "node:crypto";

const allowedAttachmentPrefix = "/alice-and-bot-attachments/";
const safeExtPattern = /^\.[a-zA-Z0-9]{1,10}$/;

export const generatePairingCode = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `pair-${hex}`;
};

const safeEqual = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
};

export const matchesPairingCode = (
  messageText: string,
  expectedCode: string,
): boolean => {
  if (!expectedCode || expectedCode.length < 16) return false;
  const trimmed = messageText.trim();
  if (!trimmed) return false;
  const candidate = trimmed.toLowerCase().startsWith("/pair ")
    ? trimmed.slice(6).trim()
    : trimmed;
  return safeEqual(candidate, expectedCode);
};

export type SenderAuthDecision =
  | { status: "ignore-self" }
  | { status: "paired-now"; authorizedPublicSignKey: string }
  | { status: "authorized" }
  | { status: "rejected"; reason: "unpaired" | "wrong-sender" };

export const evaluateSenderAuthorization = ({
  senderPublicSignKey,
  botPublicSignKey,
  messageText,
  pairingCode,
  authorizedPublicSignKey,
}: {
  senderPublicSignKey: string | undefined;
  botPublicSignKey: string;
  messageText: string;
  pairingCode: string;
  authorizedPublicSignKey: string | undefined;
}): SenderAuthDecision => {
  if (!senderPublicSignKey || senderPublicSignKey === botPublicSignKey) {
    return { status: "ignore-self" };
  }
  if (matchesPairingCode(messageText, pairingCode)) {
    return {
      status: "paired-now",
      authorizedPublicSignKey: senderPublicSignKey,
    };
  }
  if (
    authorizedPublicSignKey &&
    safeEqual(senderPublicSignKey, authorizedPublicSignKey)
  ) {
    return { status: "authorized" };
  }
  return {
    status: "rejected",
    reason: authorizedPublicSignKey ? "wrong-sender" : "unpaired",
  };
};

export const isAllowedAttachmentUrl = (rawUrl: string): boolean => {
  if (!rawUrl || /[\p{Cc}\\]/u.test(rawUrl)) return false;
  try {
    if (decodeURIComponent(rawUrl).includes("..")) return false;
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:") return false;
    if (parsed.hostname !== "storage.googleapis.com") return false;
    return (
      parsed.pathname.startsWith(allowedAttachmentPrefix) &&
      parsed.pathname.length > allowedAttachmentPrefix.length
    );
  } catch {
    return false;
  }
};

export const sanitizeTempExtension = (
  extCandidate: string,
  fallback = ".bin",
): string => {
  const normalized = extCandidate.startsWith(".")
    ? extCandidate.toLowerCase()
    : `.${extCandidate.toLowerCase()}`;
  return safeExtPattern.test(normalized) ? normalized : fallback;
};
