const fs = require("fs");
let code = fs.readFileSync("backend/src/main.ts", "utf8");

code = code.replace(
  /const \{ identities \} = await query\(\{\n        identities: \{\n          receivedTransactions: \{\},\n          sentTransactions: \{\},\n          \$: \{ where: \{ publicSignKey \} \},\n        \},\n      \}\);/g,
  `const { identities } = await query({
        identities: {
          wallet: {},
          receivedTransactions: {},
          sentTransactions: {},
          $: { where: { publicSignKey } },
        },
      });`,
);

code = code.replace(
  /balance: identity\.balance \|\| 0,/g,
  `balance: identity.wallet?.[0]?.balance || 0,`,
);

code = code.replace(
  /const \{ identities \} = await query\(\{\n        identities: \{\n          \$: \{ where: \{ publicSignKey \} \},\n        \},\n      \}\);/g,
  `const { identities } = await query({
        identities: {
          wallet: {},
          $: { where: { publicSignKey } },
        },
      });`,
);

code = code.replace(
  /const currentBalance = identity\.balance \|\| 0;/g,
  `const currentBalance = identity.wallet?.[0]?.balance || 0;`,
);

code = code.replace(
  /await transact\(\[\n        tx\.identities\[identity\.id\]\.update\(\{ balance: currentBalance - amount \}\),/g,
  `await transact([
        tx.wallets[identity.wallet?.[0]?.id || id()].update({ balance: currentBalance - amount }).link({ identity: identity.id }),`,
);

fs.writeFileSync("backend/src/main.ts", code);
