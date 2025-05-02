import {
  id,
  type InstantReactWebDatabase,
  InstaQLEntity,
} from "@instantdb/react";
import { apiClient } from "../../backend/src/api.ts";
import schema from "../../instant.schema.ts";
import {
  decryptAsymmetric,
  encryptAsymmetric,
  EncryptedAsymmetric,
  sign,
  verify,
} from "./crypto.ts";

type InternalMessage = { type: "text"; text: string };

export type WebhookSentUpdate = {
  payload: EncryptedMessage;
  timestamp: number;
  conversationId: string;
};

type SignedPayload<T> = {
  publicSignKey: string;
  signature: string;
  payload: T;
};

export type EncryptedMessage = EncryptedAsymmetric<
  SignedPayload<InternalMessage>
>;

export type ConversationKey = EncryptedAsymmetric<string>;

export const sendMessage = async (
  { transact, tx }: Pick<
    InstantReactWebDatabase<typeof schema>,
    "transact" | "tx"
  >,
  conversationSymmetricKey: string,
  publicSignKey: string,
  privateSignKey: string,
  message: InternalMessage,
  conversation: string,
  userInstantToken: string,
) => {
  const payloadToSign = JSON.stringify(message);
  const signature = await sign(privateSignKey, payloadToSign);
  const signedPayload = { payload: message, publicSignKey, signature };
  const messageId = id();
  await transact(
    tx.messages[messageId]
      .update({
        payload: await encryptAsymmetric(
          conversationSymmetricKey,
          signedPayload,
        ),
        timestamp: Date.now(),
      })
      .link({ conversation }),
  );
  await apiClient("notify", userInstantToken, { messageId });
  return messageId;
};

type DbMessage = InstaQLEntity<typeof schema, "messages">;

export const getConversationKey = async (
  { queryOnce }: Pick<InstantReactWebDatabase<typeof schema>, "queryOnce">,
  conversation: string,
  publicSignKey: string,
  privateEncryptKey: string,
) => {
  const { data: { keys } } = await queryOnce({
    keys: {
      $: { where: { "identity.publicSignKey": publicSignKey, conversation } },
    },
  });
  return decryptAsymmetric(privateEncryptKey, keys[0].key);
};

export const decryptMessage = async (
  conversationSymmetricKey: string,
  dbMsg: DbMessage,
) => {
  const decrypted = await decryptAsymmetric<SignedPayload<InternalMessage>>(
    conversationSymmetricKey,
    dbMsg.payload,
  );
  if (!decrypted) throw new Error("Failed to decrypt message");
  const isValid = await verify(
    decrypted.signature,
    decrypted.publicSignKey,
    dbMsg.payload,
  );
  if (!isValid) throw new Error("Invalid signature");
  return {
    publicSignKey: decrypted.publicSignKey,
    timestamp: dbMsg.timestamp,
    ...decrypted.payload,
  };
};
