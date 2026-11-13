import { Storage } from "@google-cloud/storage";
import { getEncryptedFileSizeLimitByExtension } from "../../protocol/src/attachmentLimits.ts";

const bucketName = "alice-and-bot-attachments";
const contentHashPattern = /^[a-fA-F0-9]{64}$/;
const safeExtensionPattern = /^\.[a-zA-Z0-9]{1,10}$/;
const safeConversationIdPattern = /^[a-zA-Z0-9_-]{1,128}$/;

const blockedContentTypes = new Set([
  "text/html",
  "application/xhtml+xml",
  "image/svg+xml",
  "image/svg",
  "text/javascript",
  "application/javascript",
  "text/ecmascript",
  "application/ecmascript",
  "text/xml",
  "application/xml",
]);

const bucketCache: {
  instance: ReturnType<Storage["bucket"]> | null;
  credentials: string;
} = {
  instance: null,
  credentials: "",
};

const getBucket = () => {
  const gcpCredentials = Deno.env.get("GCP_CREDENTIALS") ?? "";
  if (!bucketCache.instance || gcpCredentials !== bucketCache.credentials) {
    bucketCache.credentials = gcpCredentials;
    const storage = new Storage(
      gcpCredentials ? { credentials: JSON.parse(gcpCredentials) } : {},
    );
    bucketCache.instance = storage.bucket(bucketName);
  }
  return bucketCache.instance;
};

export const sanitizeUploadExtension = (fileName: string): string => {
  if (
    fileName.includes("/") || fileName.includes("\\") || fileName.includes("..")
  ) {
    throw new Error("Invalid file extension");
  }
  const dot = fileName.lastIndexOf(".");
  if (dot === -1) return "";
  const ext = fileName.slice(dot).toLowerCase();
  if (!safeExtensionPattern.test(ext)) {
    throw new Error("Invalid file extension");
  }
  return ext;
};

export const sanitizeUploadContentType = (contentType: string): string => {
  const base = contentType.split(";")[0].trim().toLowerCase();
  if (!base || blockedContentTypes.has(base)) {
    return "application/octet-stream";
  }
  return contentType;
};

export const buildSafeAttachmentPath = ({
  conversationId,
  contentHash,
  fileName,
}: {
  conversationId: string;
  contentHash: string;
  fileName: string;
}): string => {
  if (!safeConversationIdPattern.test(conversationId)) {
    throw new Error("Invalid conversationId");
  }
  if (!contentHashPattern.test(contentHash)) {
    throw new Error("Invalid contentHash");
  }
  const ext = sanitizeUploadExtension(fileName);
  return `attachments/${conversationId}/${contentHash.toLowerCase()}${ext}`;
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
}): Promise<{ uploadUrl: string; fileUrl: string; maxSize: number }> => {
  const filePath = buildSafeAttachmentPath({
    conversationId,
    contentHash,
    fileName,
  });
  const safeContentType = sanitizeUploadContentType(contentType);
  const file = getBucket().file(filePath);
  const maxSize = getEncryptedFileSizeLimitByExtension(fileName);

  const [uploadUrl] = await file.getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + 15 * 60 * 1000,
    contentType: safeContentType,
    extensionHeaders: {
      "x-goog-content-length-range": `0,${maxSize}`,
    },
  });

  const fileUrl = `https://storage.googleapis.com/${bucketName}/${filePath}`;

  return { uploadUrl, fileUrl, maxSize };
};
