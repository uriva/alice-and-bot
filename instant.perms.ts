import type { InstantRules } from "@instantdb/core";
import type { AppSchema } from "./instant.schema.ts";

const lockedAllow = {
  view: "false",
  create: "false",
  update: "false",
  delete: "false",
} as const;

const noWriteAllow = {
  create: "false",
  update: "false",
  delete: "false",
} as const;

const isIdentityOwner = "auth.email != null && auth.email == data.instantEmail";
const isConversationParticipant =
  "auth.email != null && auth.email in data.ref('participants.instantEmail')";
const isLinkedConversationParticipant =
  "auth.email != null && auth.email in data.ref('conversation.participants.instantEmail')";
const isKeyOwner =
  "auth.email != null && auth.email in data.ref('owner.instantEmail')";

const rules = {
  $default: {
    allow: {
      $default: "false",
    },
  },
  attrs: {
    allow: {
      $default: "false",
      create: "false",
    },
  },
  cryptoPayments: { allow: { ...lockedAllow } },
  wallets: { allow: { ...lockedAllow } },
  transactions: { allow: { ...lockedAllow } },
  accounts: { allow: { ...lockedAllow } },
  $users: { allow: { ...lockedAllow } },
  pushSubscriptions: { allow: { ...lockedAllow } },
  $files: { allow: { ...lockedAllow } },
  identities: {
    allow: {
      view: "true",
      ...noWriteAllow,
      link: { archivedConversations: isIdentityOwner },
      unlink: { archivedConversations: isIdentityOwner },
    },
    fields: {
      webhook: "false",
    },
  },
  conversations: {
    allow: { view: isConversationParticipant, ...noWriteAllow },
  },
  messages: {
    allow: { view: isLinkedConversationParticipant, ...noWriteAllow },
  },
  keys: {
    allow: { view: isKeyOwner, ...noWriteAllow },
  },
  canvases: {
    allow: { view: isLinkedConversationParticipant, ...noWriteAllow },
  },
  typingStates: {
    allow: { view: isLinkedConversationParticipant, ...noWriteAllow },
  },
  uiElements: {
    allow: { view: isLinkedConversationParticipant, ...noWriteAllow },
  },
} satisfies InstantRules<AppSchema>;

export default rules;
