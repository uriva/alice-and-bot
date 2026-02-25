import type { InstantAdminDatabase } from "@instantdb/admin";
import type { InstaQLEntity } from "@instantdb/core";
import { map, pipe } from "@uri/gamla";
import stringify from "safe-stable-stringify";
import { apiClient, getUploadUrl } from "../../backend/src/api.ts";
import type schema from "../../instant.schema.ts";
import { chatPath } from "../../landing/src/paths.ts";
import {
  encryptAsymmetric,
  generateKeyPair,
  generateSymmetricKey,
} from "../../protocol/src/crypto.ts";
import { normalizeAlias } from "./alias.ts";
import { buildSignedRequest } from "./authClient.ts";
import {
  decryptAsymmetric,
  decryptBinary,
  decryptSymmetric,
  encryptBinary,
  type EncryptedAsymmetric,
  type EncryptedSymmetric,
  encryptSymmetric,
  sign,
  verify,
} from "./crypto.ts";

export const instantAppId = "8f3bebac-da7b-44ab-9cf5-46a6cc11557e";

type AttachmentBase = {
  url: string;
  name: string;
  size: number;
};

export type ImageAttachment = AttachmentBase & {
  type: "image";
  mimeType: `image/${string}`;
  width?: number;
  height?: number;
};

export type AudioAttachment = AttachmentBase & {
  type: "audio";
  mimeType: `audio/${string}`;
  duration?: number;
};

export type VideoAttachment = AttachmentBase & {
  type: "video";
  mimeType: `video/${string}`;
  duration?: number;
  width?: number;
  height?: number;
};

export type FileAttachment = AttachmentBase & {
  type: "file";
  mimeType: string;
};

export type LocationAttachment = {
  type: "location";
  latitude: number;
  longitude: number;
  label?: string;
};

export type Attachment =
  | ImageAttachment
  | AudioAttachment
  | VideoAttachment
  | FileAttachment
  | LocationAttachment;

import {
  fileSizeLimits,
  getFileSizeLimitByMimeType,
  maxTextLength,
  MB,
} from "./attachmentLimits.ts";
export { fileSizeLimits, getFileSizeLimitByMimeType, maxTextLength, MB };

type TextMessage = {
  type: "text";
  text: string;
  attachments?: Attachment[];
};

type EditMessage = {
  type: "edit";
  editOf: string;
  text: string;
  attachments?: Attachment[];
};

type SpinnerMessage = {
  type: "spinner";
  text: string;
  active: boolean;
  elementId: string;
};

type ProgressMessage = {
  type: "progress";
  text: string;
  percentage: number;
  elementId: string;
};

type InternalMessage =
  | TextMessage
  | EditMessage
  | SpinnerMessage
  | ProgressMessage;

export type Profile = {
  publicSignKey: string;
  name?: string;
  avatar?: string;
  alias?: string;
};

export type ConversationInfoPayload = {
  participants: Profile[]; // first N participants (capped)
  isPartial: boolean; // true if there are more participants not included
};

export type WebhookUpdate = {
  payload: EncryptedMessage;
  timestamp: number;
  conversationId: string;
  messageId: string;
};

type SignedPayload<T> = {
  publicSignKey: string;
  signature: string;
  payload: T;
};

export type EncryptedMessage = EncryptedSymmetric<
  SignedPayload<InternalMessage>
>;

const msgToStr = stringify;

export type EncryptedConversationKey = EncryptedAsymmetric<string>;

type SendMessageParams = {
  conversationKey: string;
  credentials: Credentials;
  message: InternalMessage;
  conversation: string;
};

export const sendMessage = async (params: {
  credentials: Credentials;
  conversation: string;
  message: InternalMessage;
}): Promise<{ messageId: string }> =>
  sendMessageWithKey({
    ...params,
    conversationKey: await getConversationKey(
      params.credentials,
      params.conversation,
    ),
  });

const encryptAndSign = async (
  conversationKey: string,
  { privateSignKey, publicSignKey }: Pick<
    Credentials,
    "privateSignKey" | "publicSignKey"
  >,
  message: InternalMessage,
) => {
  const serialized = msgToStr(message);
  if (serialized.length > maxTextLength) {
    throw new Error(
      `Message exceeds maximum length of ${maxTextLength} characters`,
    );
  }
  return encryptSymmetric(conversationKey, {
    payload: message,
    publicSignKey,
    signature: await sign(privateSignKey, serialized),
  });
};

export const sendMessageWithKey = async ({
  conversationKey,
  conversation,
  credentials,
  message,
}: SendMessageParams): Promise<{ messageId: string }> =>
  apiClient({
    endpoint: "sendMessage",
    payload: {
      conversation,
      encryptedMessage: await encryptAndSign(
        conversationKey,
        credentials,
        message,
      ),
    },
  });

type DbMessage = InstaQLEntity<typeof schema, "messages">;

const getConversationKey = async (creds: Credentials, convo: string) => {
  const result = await apiClient({
    endpoint: "conversationKey",
    payload: {
      conversationId: convo,
      publicSignKey: creds.publicSignKey,
    },
  });
  if ("error" in result) {
    throw new Error("No keys found for conversation");
  }
  return await decryptAsymmetric<string>(
    creds.privateEncryptKey,
    result.conversationKey as EncryptedAsymmetric<string>,
  );
};

export const handleWebhookUpdate = async (
  whUpdate: WebhookUpdate,
  credentials: Credentials,
): Promise<{
  conversationId: string;
  message: DistributeOmit<DecipheredMessage, "id">;
  conversationKey: string;
  messageId: string;
}> => {
  const key = await getConversationKey(credentials, whUpdate.conversationId);
  return {
    conversationId: whUpdate.conversationId,
    message: await decryptMessagePayload(key)(whUpdate),
    conversationKey: key,
    messageId: whUpdate.messageId,
  };
};

type DecipheredMessageBase = {
  id: string;
  publicSignKey: string;
  timestamp: number;
  text: string;
};

type DecipheredTextMessage = DecipheredMessageBase & {
  type: "text";
  attachments?: Attachment[];
};

type DecipheredEditMessage = DecipheredMessageBase & {
  type: "edit";
  editOf: string;
  attachments?: Attachment[];
};

type DecipheredSpinnerMessage = DecipheredMessageBase & {
  type: "spinner";
  active: boolean;
  elementId: string;
};

type DecipheredProgressMessage = DecipheredMessageBase & {
  type: "progress";
  percentage: number;
  elementId: string;
};

export type DecipheredMessage =
  | DecipheredTextMessage
  | DecipheredEditMessage
  | DecipheredSpinnerMessage
  | DecipheredProgressMessage;

type DistributeOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K>
  : never;

const decryptedPayloadToMessage = (
  publicSignKey: string,
  timestamp: number,
  decryptedPayload: InternalMessage,
): DistributeOmit<DecipheredMessage, "id"> => {
  const base = { publicSignKey, timestamp, text: decryptedPayload.text };
  if (decryptedPayload.type === "spinner") {
    return {
      ...base,
      type: "spinner",
      active: decryptedPayload.active,
      elementId: decryptedPayload.elementId,
    };
  }
  if (decryptedPayload.type === "progress") {
    return {
      ...base,
      type: "progress",
      percentage: decryptedPayload.percentage,
      elementId: decryptedPayload.elementId,
    };
  }
  if (decryptedPayload.type === "edit") {
    return {
      ...base,
      type: "edit",
      editOf: decryptedPayload.editOf,
      attachments: decryptedPayload.attachments,
    };
  }
  return { ...base, type: "text", attachments: decryptedPayload.attachments };
};

const decryptMessagePayload = (conversationSymmetricKey: string) =>
async (
  { payload, timestamp }: Omit<DbMessage, "id">,
) => {
  const { signature, payload: decryptedPayload, publicSignKey } =
    await decryptSymmetric<SignedPayload<InternalMessage>>(
      conversationSymmetricKey,
      payload,
    );
  if (await verify(signature, publicSignKey, msgToStr(decryptedPayload))) {
    return decryptedPayloadToMessage(
      publicSignKey,
      timestamp,
      decryptedPayload,
    );
  }
  throw new Error("Invalid signature");
};

export const decryptMessage = (conversationSymmetricKey: string) =>
async (
  { id, payload, timestamp }: DbMessage,
): Promise<DecipheredMessage> => {
  const base = await decryptMessagePayload(conversationSymmetricKey)({
    payload,
    timestamp,
  });
  return { id, ...base } as DecipheredMessage;
};

// deno-lint-ignore ban-types
type Identity = InstaQLEntity<typeof schema, "identities", { account: {} }>;

export const createConversation = (
  db: () => InstantAdminDatabase<typeof schema>,
) =>
async (
  publicSignKeys: string[],
  conversationTitle: string,
) => {
  const { identities } = await db().query({
    identities: {
      account: {},
      $: { where: { publicSignKey: { $in: publicSignKeys } } },
    },
  });
  if (identities.length !== publicSignKeys.length) {
    return { error: "invalid-participants" };
  }
  const signKeyToEncrypionKey = pipe(
    map(({ publicSignKey, publicEncryptKey }: Identity) =>
      [publicSignKey, publicEncryptKey] as const
    ),
    Object.fromEntries<string>,
  )(identities);
  const symmetricKey = await generateSymmetricKey();
  return pipe(
    map(async (publicSignKey: string) =>
      [
        publicSignKey,
        await encryptAsymmetric(
          signKeyToEncrypionKey[publicSignKey],
          symmetricKey,
        ),
      ] as const
    ),
    Object.fromEntries<EncryptedConversationKey>,
    (publicSignKeyToEncryptedSymmetricKey) =>
      apiClient({
        endpoint: "createConversation",
        payload: {
          publicSignKeyToEncryptedSymmetricKey,
          title: conversationTitle,
        },
      }),
  )(publicSignKeys);
};

export type Credentials = {
  publicSignKey: string;
  privateSignKey: string;
  privateEncryptKey: string;
};

export const createIdentity = async (
  name: string,
  alias?: string,
): Promise<Credentials> => {
  const { publicKey, privateKey } = await generateKeyPair("sign");
  const encryptKey = await generateKeyPair("encrypt");
  await apiClient({
    endpoint: "createAnonymousIdentity",
    payload: {
      name,
      publicSignKey: publicKey,
      publicEncryptKey: encryptKey.publicKey,
      ...(alias ? { alias } : {}),
    },
  });
  return {
    publicSignKey: publicKey,
    privateSignKey: privateKey,
    privateEncryptKey: encryptKey.privateKey,
  };
};

export const baseUrl = "https://aliceandbot.com";

export const chatWithMeLink = (
  publicSignKey: string,
): string =>
  `${baseUrl}${chatPath}?chatWith=${encodeURIComponent(publicSignKey)}`;

export const setAlias = async ({
  alias,
  credentials,
}: { alias: string; credentials: Credentials }): Promise<
  | { success: true }
  | {
    success: false;
    error: "alias-taken" | "invalid-alias" | "not-found" | "invalid-auth";
  }
> =>
  apiClient({
    endpoint: "setAlias",
    payload: await buildSignedRequest(credentials, "setAlias", {
      alias: normalizeAlias(alias),
    }),
  });

export const publicSignKeyToAlias = (
  publicSignKey: string,
): Promise<{ alias: string } | { error: "no-such-identity" | "no-alias" }> =>
  apiClient({
    endpoint: "publicSignKeyToAlias",
    payload: { publicSignKey },
  });

const arrayBufferToHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

const computeHash = async (data: ArrayBuffer): Promise<string> => {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return arrayBufferToHex(hashBuffer);
};

const getAudioDuration = (file: File): Promise<number | undefined> =>
  new Promise((resolve) => {
    if (!file.type.startsWith("audio/")) {
      resolve(undefined);
      return;
    }
    const audio = new Audio();
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const dur = audio.duration;
      URL.revokeObjectURL(audio.src);
      if (!isFinite(dur) || isNaN(dur)) {
        resolve(undefined);
        return;
      }
      resolve(Math.round(dur));
    };
    audio.onerror = () => resolve(undefined);
    audio.src = URL.createObjectURL(file);
  });

export const uploadAttachment = async ({
  credentials,
  conversationId,
  conversationKey,
  file,
  durationOverride,
}: {
  credentials: Credentials;
  conversationId: string;
  conversationKey: string;
  file: File;
  durationOverride?: number;
}): Promise<Attachment | { error: string }> => {
  const limit = getFileSizeLimitByMimeType(file.type);
  if (file.size > limit) {
    return { error: `file-too-large:${Math.round(limit / MB)}MB` };
  }
  const arrayBuffer = await file.arrayBuffer();
  const encrypted = await encryptBinary(conversationKey, arrayBuffer);
  const contentHash = await computeHash(encrypted);

  const result = await getUploadUrl(credentials, {
    conversationId,
    contentHash,
    fileName: file.name,
    contentType: "application/octet-stream",
  });
  if ("error" in result) return { error: result.error };

  const { uploadUrl, fileUrl, maxSize } = result;

  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "application/octet-stream",
      "x-goog-content-length-range": `0,${maxSize}`,
    },
    body: encrypted,
  });
  if (!response.ok) {
    return {
      error: `upload-failed:${response.status}:${await response.text()}`,
    };
  }

  const base: { url: string; name: string; size: number } = {
    url: fileUrl,
    name: file.name,
    size: file.size,
  };

  if (file.type.startsWith("image/")) {
    return { ...base, type: "image", mimeType: file.type as `image/${string}` };
  }
  if (file.type.startsWith("audio/")) {
    const duration = durationOverride ?? await getAudioDuration(file);
    return {
      ...base,
      type: "audio",
      mimeType: file.type as `audio/${string}`,
      duration,
    };
  }
  if (file.type.startsWith("video/")) {
    return { ...base, type: "video", mimeType: file.type as `video/${string}` };
  }
  return { ...base, type: "file", mimeType: file.type };
};

export const downloadAttachment = async ({
  url,
  conversationKey,
}: {
  url: string;
  conversationKey: string;
}): Promise<ArrayBuffer> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Download failed: ${response.status} ${await response.text()}`,
    );
  }
  const encrypted = await response.arrayBuffer();
  return decryptBinary(conversationKey, encrypted);
};

export const uiUpdateUrl = "https://alice-and-bot.deno.dev/ui-update";

export const buildUiUpdateUrl = (elementId: string): string =>
  `${uiUpdateUrl}?elementId=${encodeURIComponent(elementId)}`;
