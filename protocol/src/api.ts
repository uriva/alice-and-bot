import { id, type InstaQLEntity } from "@instantdb/core";
import type { InstantReactWebDatabase } from "@instantdb/react";
import { map, pipe } from "gamla";
import stringify from "safe-stable-stringify";
import {
  apiClient,
  type CreateConversationOutput,
} from "../../backend/src/api.ts";
import type schema from "../../instant.schema.ts";
import {
  encryptAsymmetric,
  generateKeyPair,
  generateSymmetricKey,
} from "../../protocol/src/crypto.ts";
import {
  decryptAsymmetric,
  decryptSymmetric,
  type EncryptedAsymmetric,
  type EncryptedSymmetric,
  encryptSymmetric,
  sign,
  verify,
} from "./crypto.ts";

export const instantAppId = "8f3bebac-da7b-44ab-9cf5-46a6cc11557e";

type InternalMessage = { type: "text"; text: string };

export type WebhookUpdate = {
  payload: EncryptedMessage;
  timestamp: number;
  conversationId: string;
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

export type SendMessageParams = {
  conversationKey: string;
  credentials: Credentials;
  message: InternalMessage;
  conversation: string;
};

export const sendMessage = (
  { transact, tx }: Pick<
    InstantReactWebDatabase<typeof schema>,
    "transact" | "tx"
  >,
) =>
async (
  {
    conversationKey,
    conversation,
    credentials: { privateSignKey, publicSignKey },
    message,
  }: SendMessageParams,
): Promise<string> => {
  const signature = await sign(privateSignKey, msgToStr(message));
  const payload = await encryptSymmetric(
    conversationKey,
    { payload: message, publicSignKey, signature },
  );
  const messageId = id();
  await transact(
    tx.messages[messageId]
      .update({ payload, timestamp: Date.now() })
      .link({ conversation }),
  );
  await apiClient({ endpoint: "notify", payload: { messageId } });
  return messageId;
};

type DbMessage = InstaQLEntity<typeof schema, "messages">;

const getConversationKeyForWebhookHandling = async (
  credentials: Credentials,
  conversation: string,
) => {
  const result = await apiClient({
    endpoint: "conversationKey",
    payload: {
      conversationId: conversation,
      publicSignKey: credentials.publicSignKey,
    },
  });
  if ("error" in result) {
    throw new Error("No keys found for conversation");
  }
  return await decryptAsymmetric<string>(
    credentials.privateEncryptKey,
    result.conversationKey as EncryptedAsymmetric<string>,
  );
};

export const handleWebhookUpdate = async (
  whUpdate: WebhookUpdate,
  credentials: Credentials,
) => {
  const key = await getConversationKeyForWebhookHandling(
    credentials,
    whUpdate.conversationId,
  );
  return {
    conversationId: whUpdate.conversationId,
    message: await decryptMessage(key)(whUpdate),
    conversationKey: key,
  };
};

export type DecipheredMessage =
  & { publicSignKey: string; timestamp: number }
  & InternalMessage;

export const decryptMessage =
  (conversationSymmetricKey: string) =>
  async (dbMsg: Omit<DbMessage, "id">): Promise<DecipheredMessage> => {
    const decrypted = await decryptSymmetric<SignedPayload<InternalMessage>>(
      conversationSymmetricKey,
      dbMsg.payload,
    );
    if (!decrypted) throw new Error("Failed to decrypt message");
    const isValid = await verify(
      decrypted.signature,
      decrypted.publicSignKey,
      msgToStr(decrypted.payload),
    );
    if (!isValid) throw new Error("Invalid signature");
    return {
      publicSignKey: decrypted.publicSignKey,
      timestamp: dbMsg.timestamp,
      ...decrypted.payload,
    };
  };

// deno-lint-ignore ban-types
type Identity = InstaQLEntity<typeof schema, "identities", { account: {} }>;

export const createConversation = (
  { queryOnce }: Pick<InstantReactWebDatabase<typeof schema>, "queryOnce">,
) =>
async (
  publicSignKeys: string[],
  conversationTitle: string,
): Promise<CreateConversationOutput> => {
  const { data: { identities } } = await queryOnce({
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
    map(async (
      publicSignKey: string,
    ): Promise<[string, EncryptedConversationKey]> => [
      publicSignKey,
      await encryptAsymmetric(
        signKeyToEncrypionKey[publicSignKey],
        symmetricKey,
      ),
    ]),
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

export const createIdentity = async (name: string): Promise<Credentials> => {
  const signKey = await generateKeyPair("sign");
  const encryptKey = await generateKeyPair("encrypt");
  await apiClient({
    endpoint: "createAnonymousIdentity",
    payload: {
      name,
      publicSignKey: signKey.publicKey,
      publicEncryptKey: encryptKey.publicKey,
    },
  });
  return {
    publicSignKey: signKey.publicKey,
    privateSignKey: signKey.privateKey,
    privateEncryptKey: encryptKey.privateKey,
  };
};
