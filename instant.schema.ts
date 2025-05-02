import { i } from "@instantdb/react";
import { Encrypted, MessagePayload } from "./crypto.ts";

const _schema = i.schema({
  entities: {
    $files: i.entity({
      path: i.string().unique().indexed(),
      url: i.any(),
    }),
    $users: i.entity({
      email: i.string().unique().indexed(),
    }),
    accounts: i.entity({}),
    messages: i.entity({
      payload: i.json<Encrypted<MessagePayload>>(),
      timestamp: i.number(),
    }),
    identities: i.entity({
      name: i.string(),
      avatar: i.string(),
      publicKey: i.string().unique().indexed(),
      privateKey: i.string().unique(),
    }),
    conversations: i.entity({
      title: i.string(),
    }),
    keys: i.entity({ key: i.string() }),
    webhooks: i.entity({ url: i.string() }),
  },
  links: {
    accountIdentities: {
      forward: { on: "accounts", label: "identities", has: "many" },
      reverse: { on: "identities", label: "account", has: "one" },
    },
    identityWebhook: {
      forward: { on: "identities", label: "webhooks", has: "many" },
      reverse: { on: "webhooks", label: "identities", has: "many" },
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
    conversationEvents: {
      forward: { on: "conversations", label: "events", has: "many" },
      reverse: { on: "messages", label: "conversations", has: "many" },
    },
  },
  rooms: {},
});

type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;
