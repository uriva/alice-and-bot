import {
  id,
  type InstantReactWebDatabase,
  InstaQLEntity,
} from "@instantdb/react";
import { sideLog } from "gamla";
import { useEffect, useState } from "preact/hooks";
import { apiClient } from "../../backend/src/api.ts";
import schema from "../../instant.schema.ts";
import {
  decryptAsymmetric,
  EncryptedSymmetric,
  EncryptedAsymmetric,
  encryptSymmetric,
  sign,
  verify,
} from "./crypto.ts";

export const instantAppId = "bb3dc195-7bdc-478b-b8f7-7fdc36f95d75";

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

export type EncryptedMessage = EncryptedSymmetric<
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
  console.log("encrypting message", payloadToSign);
  const payload = await encryptSymmetric(
    conversationSymmetricKey,
    { payload: message, publicSignKey, signature },
  );
  console.log("done encrypting message", payloadToSign);
  const messageId = id();
  await transact(
    tx.messages[messageId]
      .update({
        payload,
        timestamp: Date.now(),
      })
      .link({ conversation }),
  );
  console.log("ghello");
  await apiClient("notify", userInstantToken, { messageId });
  return messageId;
};

type DbMessage = InstaQLEntity<typeof schema, "messages">;

export const useConversationKey = (
  { useQuery }: Pick<InstantReactWebDatabase<typeof schema>, "useQuery">,
  conversation: string,
  publicSignKey: string,
  privateEncryptKey: string,
): string | null => {
  const [key, setKey] = useState<string | null>(null);
  const { isLoading, error, data } = useQuery({
    keys: {
      $: { where: { "owner.publicSignKey": publicSignKey, conversation } },
    },
  });
  if (error) {
    console.error("Failed to fetch conversation key", error);
    return null;
  }
  if (isLoading) return null;
  useEffect(() => {
    if (!data.keys[0]?.key) return;
    if (data.keys.length > 1) throw new Error("Multiple keys found");
    decryptAsymmetric<string>(privateEncryptKey, data.keys[0].key)
      .then((key: string) => {
        setKey(sideLog(key));
      });
  }, [data.keys[0]?.key, privateEncryptKey]);
  return key;
};

export type DecipheredMessage = {
  publicSignKey: string;
  timestamp: number;
} & InternalMessage;

export const decryptMessage =
  (conversationSymmetricKey: string) =>
  async (dbMsg: DbMessage): Promise<DecipheredMessage> => {
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
