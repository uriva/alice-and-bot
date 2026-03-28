const fs = require("fs");
let code = fs.readFileSync("instant.schema.ts", "utf8");

code = code.replace(
  /lastActiveAt: i\.number\(\)\.optional\(\),\n      balance: i\.number\(\)\.optional\(\),\n      priceTag: i\.number\(\)\.optional\(\),/g,
  `lastActiveAt: i.number().optional(),
      priceTag: i.number().optional(),`,
);

code = code.replace(
  /transactions: i\.entity\(\{/g,
  `wallets: i.entity({
      balance: i.number().optional(),
    }),
    transactions: i.entity({`,
);

code = code.replace(
  /transactionSender: \{/g,
  `identityWallet: {
      forward: { on: "identities", label: "wallet", has: "one" },
      reverse: { on: "wallets", label: "identity", has: "one" },
    },
    transactionSender: {`,
);

fs.writeFileSync("instant.schema.ts", code);
