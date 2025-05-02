import { decrypt, encrypt, Encrypted, sign, verify } from "./crypto.ts";
import {
  id,
  type InstantReactWebDatabase,
  InstaQLEntity,
} from "@instantdb/react";
import schema from "../../instant.schema.ts";

const url = "https://alice-and-bot-notification-service.deno.dev";

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

export type EncryptedMessage = Encrypted<SignedPayload<InternalMessage>>;

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
) => {
  const payloadToSign = JSON.stringify(message);
  const signature = await sign(privateSignKey, payloadToSign);
  const signedPayload = { payload: message, publicSignKey, signature };
  const messageId = id();
  await transact(
    tx.messages[messageId]
      .update({
        payload: await encrypt(conversationSymmetricKey, signedPayload),
        timestamp: Date.now(),
      })
      .link({ conversation }),
  );
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messageId }),
  });
  return messageId;
};

type DbMessage = InstaQLEntity<typeof schema, "messages">;

export const decryptMessage = async (
  conversationSymmetricKey: string,
  dbMsg: DbMessage,
) => {
  const decrypted = await decrypt<SignedPayload<InternalMessage>>(
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
