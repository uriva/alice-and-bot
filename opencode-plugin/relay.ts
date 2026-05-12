export const isWebhookEnvelope = (value: unknown) => {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.conversationId === "string" &&
    typeof record.payload === "string" &&
    typeof record.messageId === "string";
};

const recordFrom = (value: unknown) =>
  value && typeof value === "object" ? value as Record<string, unknown> : {};

const stringProperty = (value: unknown, key: string) => {
  const property = recordFrom(value)[key];
  return typeof property === "string" ? property : undefined;
};

const attachmentFingerprint = (value: unknown) => ({
  mimeType: stringProperty(value, "mimeType"),
  name: stringProperty(value, "name"),
  url: stringProperty(value, "url"),
});

export const recentPromptFingerprint = ({ conversationId, message }: {
  conversationId: string;
  message: unknown;
}) => {
  const attachments = recordFrom(message).attachments;
  return JSON.stringify({
    conversationId,
    text: stringProperty(message, "text")?.trim() ?? "",
    attachments: Array.isArray(attachments)
      ? attachments.map(attachmentFingerprint)
      : [],
  });
};

export const isRecentDuplicate = ({
  now,
  previousTimestamp,
  windowMs,
}: {
  now: number;
  previousTimestamp: number;
  windowMs: number;
}) => now - previousTimestamp < windowMs;
