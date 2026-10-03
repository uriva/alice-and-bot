// Docs: https://www.instantdb.com/docs/permissions
import type { InstantRules } from "@instantdb/core";

const rules = {
  $files: {
    allow: {
      view: "true",
      create: "true",
      update: "true",
      delete: "true",
    },
  },
  $users: {
    allow: {
      view: "true",
      create: "true",
      update: "true",
      delete: "false",
    },
  },
  accounts: {
    allow: {
      view: "true",
      create: "true",
      update: "true",
      delete: "true",
    },
  },
  messages: {
    allow: {
      view: "true",
      create: "true",
      update: "true",
      delete: "true",
    },
  },
  identities: {
    allow: {
      view: "true",
      create: "true",
      update: "true",
      delete: "true",
    },
  },
  wallets: {
    allow: {
      view: "false",
      create: "false",
      update: "false",
      delete: "false",
    },
  },
  transactions: {
    allow: {
      view: "false",
      create: "false",
      update: "false",
      delete: "false",
    },
  },
  pushSubscriptions: {
    allow: {
      view: "true",
      create: "true",
      update: "true",
      delete: "true",
    },
  },
  conversations: {
    allow: {
      view: "true",
      create: "true",
      update: "true",
      delete: "true",
    },
  },
  keys: {
    allow: {
      view: "true",
      create: "true",
      update: "true",
      delete: "true",
    },
  },
  typingStates: {
    allow: {
      view: "true",
      create: "true",
      update: "true",
      delete: "true",
    },
  },
  uiElements: {
    allow: {
      view: "true",
      create: "true",
      update: "true",
      delete: "true",
    },
  },
  // The canvas ciphertext is only readable with the conversation key, so
  // permissive rules here match the file's existing posture. Editing is
  // resolved by encrypting with the conversation key, not by these rules.
  canvases: {
    allow: {
      view: "true",
      create: "true",
      update: "true",
      delete: "true",
    },
  },
} satisfies InstantRules;

export default rules;
