const fs = require("fs");
let code = fs.readFileSync("backend/src/cryptoPayment.ts", "utf8");

code = code.replace(
  /const \{ identities \} = await query\(\{\n    identities: \{ \$: \{ where: \{ publicSignKey \} \} \},\n  \}\);/g,
  `const { identities } = await query({
    identities: { wallet: {}, $: { where: { publicSignKey } } },
  });`,
);

code = code.replace(
  /const newBalance = \(identity\.balance \|\| 0\) \+ usdAmount;/g,
  `const newBalance = (identity.wallet?.[0]?.balance || 0) + usdAmount;`,
);

code = code.replace(
  /tx\.identities\[identity\.id\]\.update\(\{ balance: newBalance \}\),/g,
  `tx.wallets[identity.wallet?.[0]?.id || id()].update({ balance: newBalance }).link({ identity: identity.id }),`,
);

fs.writeFileSync("backend/src/cryptoPayment.ts", code);
