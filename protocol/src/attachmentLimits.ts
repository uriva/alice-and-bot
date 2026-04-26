export const MB = 1024 * 1024;

export const encryptionOverhead = 12 + 16;

export const maxTextLength = 4_000;

const signedPayloadOverhead = 500;

const maxBytesPerChar = 3;

export const maxEncryptedMessageLength: number = Math.ceil(
  (maxTextLength + signedPayloadOverhead) * maxBytesPerChar * 4 / 3,
) + 2_000;

export const assertTextLengthOk = (serialized: string): void => {
  if (serialized.length > maxTextLength) {
    throw new Error(
      `Message exceeds maximum length of ${maxTextLength} characters`,
    );
  }
};

export const fileSizeLimits = {
  image: 10 * MB,
  audio: 25 * MB,
  video: 100 * MB,
  file: 25 * MB,
};

const imageExts = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp"];
const audioExts = [".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac"];
const videoExts = [".mp4", ".webm", ".mov", ".avi", ".mkv"];

const getExtension = (fileName: string): string => {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot).toLowerCase();
};

export const getFileSizeLimitByMimeType = (mimeType: string): number => {
  if (mimeType.startsWith("image/")) return fileSizeLimits.image;
  if (mimeType.startsWith("audio/")) return fileSizeLimits.audio;
  if (mimeType.startsWith("video/")) return fileSizeLimits.video;
  return fileSizeLimits.file;
};

export const getFileSizeLimitByExtension = (fileName: string): number => {
  const ext = getExtension(fileName);
  if (imageExts.includes(ext)) return fileSizeLimits.image;
  if (audioExts.includes(ext)) return fileSizeLimits.audio;
  if (videoExts.includes(ext)) return fileSizeLimits.video;
  return fileSizeLimits.file;
};

export const getEncryptedFileSizeLimitByExtension = (
  fileName: string,
): number => getFileSizeLimitByExtension(fileName) + encryptionOverhead;
