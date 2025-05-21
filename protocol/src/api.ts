import { id, InstaQLEntity } from "@instantdb/core";
import { type InstantReactWebDatabase } from "@instantdb/react";
import { map, pipe } from "gamla";
import { useEffect, useState } from "preact/hooks";
import stringify from "safe-stable-stringify";
import { apiClient } from "../../backend/src/api.ts";
import schema from "../../instant.schema.ts";
import {
  encryptAsymmetric,
  generateKeyPair,
  generateSymmetricKey,
} from "../../protocol/src/crypto.ts";
import {
  decryptAsymmetric,
  decryptSymmetric,
  EncryptedAsymmetric,
  EncryptedSymmetric,
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

const msgToStr = stringify;

export type EncryptedConversationKey = EncryptedAsymmetric<string>;

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
  const signature = await sign(privateSignKey, msgToStr(message));
  const payload = await encryptSymmetric(
    conversationSymmetricKey,
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
        setKey(key);
      });
  }, [data.keys[0]?.key, privateEncryptKey]);
  return key;
};

export type DecipheredMessage =
  & { publicSignKey: string; timestamp: number }
  & InternalMessage;

export const decryptMessage =
  (conversationSymmetricKey: string) =>
  async (dbMsg: DbMessage): Promise<DecipheredMessage> => {
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

export const createConversation = async (
  { queryOnce }: Pick<InstantReactWebDatabase<typeof schema>, "queryOnce">,
  publicSignKeys: string[],
  conversationTitle: string,
) => {
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

export const createIdentity = async (name: string) => {
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
