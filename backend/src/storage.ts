import { Storage } from "@google-cloud/storage";
import { getEncryptedFileSizeLimitByExtension } from "../../protocol/src/attachmentLimits.ts";

const bucketName = "alice-and-bot-attachments";

let bucketInstance: ReturnType<Storage["bucket"]> | null = null;
let lastGcpCredentials = "";

const getBucket = () => {
  const gcpCredentials = Deno.env.get("GCP_CREDENTIALS") ?? "";
  if (!bucketInstance || gcpCredentials !== lastGcpCredentials) {
    lastGcpCredentials = gcpCredentials;
    const storage = new Storage(
      gcpCredentials ? { credentials: JSON.parse(gcpCredentials) } : {},
    );
    bucketInstance = storage.bucket(bucketName);
  }
  return bucketInstance;
};

const getExtension = (fileName: string) => {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot).toLowerCase();
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
  const file = getBucket().file(filePath);
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
