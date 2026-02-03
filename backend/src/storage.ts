import { Storage } from "@google-cloud/storage";
import { getEncryptedFileSizeLimitByExtension } from "../../protocol/src/attachmentLimits.ts";

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
  const ext = getExtension(fileName);
  const filePath = `attachments/${conversationId}/${contentHash}${ext}`;
  const file = bucket.file(filePath);
  const maxSize = getEncryptedFileSizeLimitByExtension(fileName);

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

  return { uploadUrl, fileUrl, maxSize };
};
