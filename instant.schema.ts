import { i } from "@instantdb/react";
import {
  EncryptedConversationKey,
  EncryptedMessage,
} from "./protocol/src/api.ts";

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
    }),
    conversations: i.entity({ title: i.string() }),
    keys: i.entity({ key: i.json<EncryptedConversationKey>() }),
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
  },
  rooms: {},
});

type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;
