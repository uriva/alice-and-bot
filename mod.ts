import type { InstantReactWebDatabase } from "@instantdb/react";
import { init } from "@instantdb/react";
import type { JSX } from "preact";
import {
  type Conversation,
  useConversations as useConversationsNoDb,
  useGetOrCreateConversation as useGetOrCreateConversationNoDb,
  useIdentityProfile as useIdentityProfileNoDb,
} from "./clients/react/src/hooks.ts";
import { Chat as ChatNoDb, type ChatProps } from "./clients/react/src/main.tsx";
import schema from "./instant.schema.ts";
import {
  createConversation as createConversationNoDb,
  type Credentials,
  instantAppId,
  publicSignKeyToAlias as publicSignKeyToAliasNoDb,
} from "./protocol/src/clientApi.ts";
export { aliasToPublicSignKey, setWebhook } from "./backend/src/api.ts";
export {
  chatWithMeLink,
  createIdentity,
  type Credentials,
  handleWebhookUpdate,
  sendMessage,
  sendMessageWithKey,
  setAlias,
  type WebhookUpdate,
} from "./protocol/src/clientApi.ts";
export { Widget } from "./widget/src/widget.tsx";

export const publicSignKeyToAlias = (publicSignKey: string): Promise<
  { alias: string } | { error: "no-such-identity" | "no-alias" }
> => publicSignKeyToAliasNoDb(accessDb, publicSignKey);

let db: InstantReactWebDatabase<typeof schema> | null = null;

const accessDb = (): InstantReactWebDatabase<typeof schema> => {
  if (!db) {
    db = init({ appId: instantAppId, schema, devtool: false });
  }
  return db;
};

export const useGetOrCreateConversation: (
  params: { credentials: Credentials; participants: string[] },
) => string | null = useGetOrCreateConversationNoDb(accessDb);

export const useConversations: (
  publicSignKey: string,
) => Conversation[] | null = useConversationsNoDb(accessDb);

export const useIdentityProfile: (
  publicSignKey: string,
) => { name?: string; avatar?: string; alias?: string } | null =
  useIdentityProfileNoDb(accessDb);

export const getProfile = async (
  publicSignKey: string,
): Promise<{ name?: string; avatar?: string; alias?: string } | null> => {
  const { data: { identities } } = await accessDb().queryOnce({
    identities: { $: { where: { publicSignKey } } },
  });
  if (!identities.length) return null;
  const { name, avatar, alias } = identities[0];
  return { name, avatar, alias };
};

export const Chat: (
  { credentials, conversationId, onClose }: ChatProps,
) => JSX.Element = ChatNoDb(accessDb);

export const createConversation: (
  publicSignKeys: string[],
  conversationTitle: string,
) => Promise<{ conversationId: string } | { error: string }> =
  createConversationNoDb(accessDb);

export const getConversations = async (
  publicSignKeys: string[],
): Promise<Conversation[]> => {
  const { data } = await accessDb().queryOnce({
    conversations: {
      participants: {},
      $: { where: { "participants.publicSignKey": { $in: publicSignKeys } } },
    },
  });
  return data.conversations.filter((c) => {
    const participantKeys = c.participants.map((p) => p.publicSignKey);
    return publicSignKeys.every((k) => participantKeys.includes(k)) &&
      participantKeys.length === publicSignKeys.length;
  });
};

export const embedScript = ({ publicSignKey, initialMessage }: {
  publicSignKey: string;
  initialMessage: string;
}): string =>
  `<script src="https://storage.googleapis.com/alice-and-bot/widget/dist/widget.iife.js" async onload="aliceAndBot.loadChatWidget({ dialingTo: '${publicSignKey}', initialMessage: '${initialMessage}' })"></script>`;
