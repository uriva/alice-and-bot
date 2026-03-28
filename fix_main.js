const fs = require("fs");
let code = fs.readFileSync("backend/src/main.ts", "utf8");

code = code.replace(
  /identities: \{\s*\$: \{ where: \{ publicSignKey \} \},\s*receivedTransactions: \{\},\s*sentTransactions: \{\},\s*\}/g,
  `identities: {
          wallet: {},
          $: { where: { publicSignKey } },
          receivedTransactions: {},
          sentTransactions: {},
        }`,
);

code = code.replace(
  /const \{ identities: identityMatches \} = await query\(\{\n\s*identities: \{ \$: \{ where: \{ publicSignKey \} \} \},\n\s*\}\);/g,
  `const { identities: identityMatches } = await query({
        identities: { wallet: {}, $: { where: { publicSignKey } } },
      });`,
);

fs.writeFileSync("backend/src/main.ts", code);
