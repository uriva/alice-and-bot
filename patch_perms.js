const fs = require("fs");

const schemaContent = fs.readFileSync("instant.schema.ts", "utf8");
const entitiesMatch = schemaContent.match(
  /entities:\s*\{([\s\S]*?)\},\n  links:/,
);
const entityNames = [];
if (entitiesMatch) {
  const lines = entitiesMatch[1].split("\n");
  for (const line of lines) {
    const m = line.match(/^\s*([a-zA-Z0-9_$]+):\s*i\.entity/);
    if (m) {
      entityNames.push(m[1]);
    }
  }
}

let perms = `// Docs: https://www.instantdb.com/docs/permissions
import type { InstantRules } from "@instantdb/react";

const rules = {
`;

for (const name of entityNames) {
  if (name === "wallets" || name === "transactions") {
    perms += `  ${name}: {
    allow: {
      view: "false",
      create: "false",
      update: "false",
      delete: "false",
    },
  },
`;
  } else {
    perms += `  ${name}: {
    allow: {
      view: "true",
      create: "true",
      update: "true",
      delete: "true",
    },
  },
`;
  }
}

perms += `} satisfies InstantRules;

export default rules;
`;

fs.writeFileSync("instant.perms.ts", perms);
