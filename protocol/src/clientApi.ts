import type { InstaQLEntity } from "@instantdb/core";
import type { InstantReactWebDatabase } from "@instantdb/react";
import { map, pipe } from "gamla";
import stringify from "safe-stable-stringify";
import {
  apiClient,
  canonicalStringForAuthSign,
  issueNonce,
} from "../../backend/src/api.ts";
import type schema from "../../instant.schema.ts";
import { chatPath } from "../../landing/src/paths.ts";
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

export const sendMessageWithKey = async ({
  conversationKey,
  conversation,
  credentials: { privateSignKey, publicSignKey },
  message,
}: SendMessageParams): Promise<{ messageId: string }> => {
  const encryptedMessage = await encryptSymmetric(
    conversationKey,
    {
      payload: message,
      publicSignKey,
      signature: await sign(privateSignKey, msgToStr(message)),
    },
  );
  return apiClient({
    endpoint: "sendMessage",
    payload: { conversation, encryptedMessage },
  });
};

type DbMessage = InstaQLEntity<typeof schema, "messages">;

const getConversationKey = async (
  credentials: Credentials,
  conversation: string,
): Promise<string> => {
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
): Promise<{
  conversationId: string;
  message: DecipheredMessage;
  conversationKey: string;
}> => {
  const key = await getConversationKey(credentials, whUpdate.conversationId);
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
  db: () => InstantReactWebDatabase<typeof schema>,
) =>
async (
  publicSignKeys: string[],
  conversationTitle: string,
) => {
  const { data: { identities } } = await db().queryOnce({
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
  const { publicKey, privateKey } = await generateKeyPair("sign");
  const encryptKey = await generateKeyPair("encrypt");
  await apiClient({
    endpoint: "createAnonymousIdentity",
    payload: {
      name,
      publicSignKey: publicKey,
      publicEncryptKey: encryptKey.publicKey,
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

const normalizeAlias = (alias: string): string =>
  alias.trim().toLowerCase().slice(0, 25).replace(/\s+/g, "");

export const setAlias = async ({
  alias,
  credentials,
}: { alias: string; credentials: Credentials }): Promise<
  | { success: true }
  | {
    success: false;
    error: "alias-taken" | "invalid-alias" | "not-found" | "invalid-auth";
  }
> => {
  const { nonce } = await issueNonce(credentials.publicSignKey);
  const payload = { alias: normalizeAlias(alias) };
  return apiClient({
    endpoint: "setAlias",
    payload: {
      payload,
      publicSignKey: credentials.publicSignKey,
      nonce,
      authToken: await sign(
        credentials.privateSignKey,
        canonicalStringForAuthSign({
          action: "setAlias",
          publicSignKey: credentials.publicSignKey,
          payload,
          nonce,
        }),
      ),
    },
  });
};

export const publicSignKeyToAlias = async (
  db: () => InstantReactWebDatabase<typeof schema>,
  publicSignKey: string,
): Promise<{ alias: string } | { error: "no-such-identity" | "no-alias" }> => {
  const { data: { identities } } = await db().queryOnce({
    identities: { $: { where: { publicSignKey } } },
  });
  if (identities.length === 0) return { error: "no-such-identity" };
  const alias = identities[0].alias;
  if (!alias) return { error: "no-alias" };
  return { alias };
};
