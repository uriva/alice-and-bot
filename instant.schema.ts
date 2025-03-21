import { i } from "@instantdb/react";

const _schema = i.schema({
  entities: {
    $files: i.entity({
      path: i.string().unique().indexed(),
      url: i.any(),
    }),
    $users: i.entity({
      email: i.string().unique().indexed(),
    }),
    events: i.entity({
      text: i.string(),
      timestamp: i.number(),
    }),
    users: i.entity({
      name: i.string(),
      avatar: i.string(),
      publicKey: i.string(),
      privateKey: i.string(),
    }),
    conversations: i.entity({
      name: i.string(),
    }),
  },
  links: {
    conversationParticipants: {
      forward: { on: "conversations", label: "participants", has: "many" },
      reverse: { on: "users", label: "conversations", has: "many" },
    },
    conversationAdmins: {
      forward: { on: "conversations", label: "admins", has: "many" },
      reverse: { on: "users", label: "managedConversations", has: "many" },
    },
    conversationEvents: {
      forward: { on: "conversations", label: "events", has: "many" },
      reverse: { on: "events", label: "conversations", has: "many" },
    },
  },
  rooms: {},
});

type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;
