export const isWebhookEnvelope = (value: unknown) => {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.conversationId === "string" &&
    typeof record.payload === "string" &&
    typeof record.messageId === "string";
};
