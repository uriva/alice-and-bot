import type { InstantRules } from "@instantdb/react";

const rules: InstantRules = {
  identities: {
    allow: {
      view: "true",
      create: "false",
      update: "newData.balance == data.balance",
      delete: "false",
    },
  },
};
export default rules;
