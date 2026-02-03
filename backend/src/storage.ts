import { Storage } from "@google-cloud/storage";

const bucketName = "alice-and-bot-attachments";

const gcpCredentials = Deno.env.get("GCP_CREDENTIALS");

const storage = new Storage(
  gcpCredentials ? { credentials: JSON.parse(gcpCredentials) } : {},
);
const bucket = storage.bucket(bucketName);

const getExtension = (fileName: string) => {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot);
};

const MB = 1024 * 1024;

const fileSizeLimits: Record<string, number> = {
  image: 10 * MB,
  audio: 25 * MB,
  video: 100 * MB,
  file: 25 * MB,
};

const getMaxFileSize = (fileName: string): number => {
  const ext = getExtension(fileName).toLowerCase();
  const imageExts = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp"];
  const audioExts = [".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac"];
  const videoExts = [".mp4", ".webm", ".mov", ".avi", ".mkv"];

  if (imageExts.includes(ext)) return fileSizeLimits.image;
  if (audioExts.includes(ext)) return fileSizeLimits.audio;
  if (videoExts.includes(ext)) return fileSizeLimits.video;
  return fileSizeLimits.file;
};

export const generateUploadUrl = async ({
  conversationId,
  contentHash,
  fileName,
  contentType,
}: {
  conversationId: string;
  contentHash: string;
  fileName: string;
  contentType: string;
}): Promise<{ uploadUrl: string; fileUrl: string }> => {
  const ext = getExtension(fileName);
  const filePath = `attachments/${conversationId}/${contentHash}${ext}`;
  const file = bucket.file(filePath);
  const maxSize = getMaxFileSize(fileName);

  const [uploadUrl] = await file.getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + 15 * 60 * 1000,
    contentType,
    extensionHeaders: {
      "x-goog-content-length-range": `0,${maxSize}`,
    },
  });

  const fileUrl = `https://storage.googleapis.com/${bucketName}/${filePath}`;

  return { uploadUrl, fileUrl };
};
