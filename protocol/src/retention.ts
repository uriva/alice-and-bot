export const retentionDays: number = 30;
export const retentionMs: number = retentionDays * 24 * 60 * 60 * 1000;
export const retentionSummary: string =
  `Messages and file attachments auto-delete after ${retentionDays} days.`;

export const attachmentExpiredErrorPrefix: string = "Attachment expired";

export const createAttachmentExpiredError = (status: number): Error =>
  new Error(`${attachmentExpiredErrorPrefix} (${status})`);

export const isAttachmentExpiredError = (error: unknown): boolean =>
  error instanceof Error &&
  error.message.startsWith(attachmentExpiredErrorPrefix);

export const isTimestampExpired = (
  timestamp: number,
  nowMs: number = Date.now(),
): boolean => timestamp > 0 && nowMs - timestamp >= retentionMs;
