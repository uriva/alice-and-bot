import type { InstantRules } from "@instantdb/core";
import type { AppSchema } from "./instant.schema.ts";

const lockedAllow = {
  view: "false",
  create: "false",
  update: "false",
  delete: "false",
} as const;

const viewOnlyAllow = {
  view: "true",
  create: "false",
  update: "false",
  delete: "false",
} as const;

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
      ...viewOnlyAllow,
      link: { archivedConversations: "true" },
      unlink: { archivedConversations: "true" },
    },
    fields: {
      webhook: "false",
    },
  },
  conversations: { allow: { ...viewOnlyAllow } },
  messages: { allow: { ...viewOnlyAllow } },
  keys: { allow: { ...viewOnlyAllow } },
  canvases: { allow: { ...viewOnlyAllow } },
  typingStates: { allow: { ...viewOnlyAllow } },
  uiElements: { allow: { ...viewOnlyAllow } },
} satisfies InstantRules<AppSchema>;

export default rules;
