import { i } from "@instantdb/core";
import type {
  EncryptedConversationKey,
  EncryptedMessage,
} from "./protocol/src/clientApi.ts";

export type PushSubscriptionJSON = {
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
};

const _schema = i.schema({
  entities: {
    $files: i.entity({
      path: i.string().unique().indexed(),
      url: i.any(),
    }),
    $users: i.entity({
      email: i.string().unique().indexed(),
    }),
    accounts: i.entity({
      email: i.string().unique().indexed().optional(),
      accessToken: i.string().optional().unique().indexed(),
    }),
    messages: i.entity({
      payload: i.json<EncryptedMessage>(),
      timestamp: i.number().indexed(),
    }),
    identities: i.entity({
      name: i.string().optional(),
      avatar: i.string().optional(),
      publicEncryptKey: i.string().unique().indexed(),
      publicSignKey: i.string().unique().indexed(),
      webhook: i.string().indexed().optional(),
      alias: i.string().unique().indexed().optional(),
    }),
    pushSubscriptions: i.entity({
      endpoint: i.string().unique().indexed(),
      subscription: i.json<PushSubscriptionJSON>(),
      createdAt: i.number(),
    }),
    conversations: i.entity({ title: i.string() }),
    keys: i.entity({ key: i.json<EncryptedConversationKey>() }),
    typingStates: i.entity({ updatedAt: i.number() }),
    uiElements: i.entity({
      elementId: i.string().unique().indexed(),
      type: i.string(),
      text: i.string().optional(),
      active: i.boolean().optional(),
      percentage: i.number().optional(),
      updatedAt: i.number(),
    }),
  },
  links: {
    conversationMessages: {
      forward: { on: "conversations", label: "messages", has: "many" },
      reverse: { on: "messages", label: "conversation", has: "one" },
    },
    accountIdentities: {
      forward: { on: "accounts", label: "identities", has: "many" },
      reverse: { on: "identities", label: "account", has: "one" },
    },
    conversationKeys: {
      forward: { on: "conversations", label: "keys", has: "many" },
      reverse: { on: "keys", label: "conversation", has: "one" },
    },
    identityKeys: {
      forward: { on: "identities", label: "keys", has: "many" },
      reverse: { on: "keys", label: "owner", has: "one" },
    },
    conversationParent: {
      forward: { on: "conversations", label: "parent", has: "one" },
      reverse: { on: "conversations", label: "child", has: "one" },
    },
    conversationParticipants: {
      forward: { on: "conversations", label: "participants", has: "many" },
      reverse: { on: "identities", label: "conversations", has: "many" },
    },
    conversationAdmins: {
      forward: { on: "conversations", label: "admins", has: "many" },
      reverse: { on: "identities", label: "managedConversations", has: "many" },
    },
    identityPushSubscriptions: {
      forward: { on: "identities", label: "pushSubscriptions", has: "many" },
      reverse: {
        on: "pushSubscriptions",
        label: "owner",
        has: "one",
        onDelete: "cascade",
      },
    },
    pushSubscriptionConversation: {
      forward: {
        on: "pushSubscriptions",
        label: "conversation",
        has: "one",
        onDelete: "cascade",
      },
      reverse: { on: "conversations", label: "pushSubscriptions", has: "many" },
    },
    identityTypingStates: {
      forward: { on: "identities", label: "typingStates", has: "many" },
      reverse: {
        on: "typingStates",
        label: "owner",
        has: "one",
        onDelete: "cascade",
      },
    },
    conversationTypingStates: {
      forward: {
        on: "typingStates",
        label: "conversation",
        has: "one",
        onDelete: "cascade",
      },
      reverse: { on: "conversations", label: "typingStates", has: "many" },
    },
    conversationUiElements: {
      forward: {
        on: "uiElements",
        label: "conversation",
        has: "one",
        onDelete: "cascade",
      },
      reverse: { on: "conversations", label: "uiElements", has: "many" },
    },
  },
  rooms: {},
});

type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;
