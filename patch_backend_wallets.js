const fs = require("fs");
let code = fs.readFileSync("backend/src/createConversation.ts", "utf8");

code = code.replace(
  /const \{ identities \} = await query\(\{/g,
  `const { identities } = await query({`,
);

code = code.replace(
  /identities: \{/g,
  `identities: {
        wallet: {},`,
);

code = code.replace(
  /const senderBalance = sender\.balance \|\| 0;/g,
  `const senderBalance = sender.wallet?.[0]?.balance || 0;`,
);

code = code.replace(
  /tx\.identities\[sender\.id\]\.update\(\{ balance: senderBalance - totalCost \}\)/g,
  `tx.wallets[sender.wallet?.[0]?.id || id()].update({ balance: senderBalance - totalCost }).link({ identity: sender.id })`,
);

code = code.replace(
  /tx\.identities\[recipient\.id\]\.update\(\{ balance: \(recipient\.balance \|\| 0\) \+ recipient\.priceTag \}\)/g,
  `tx.wallets[recipient.wallet?.[0]?.id || id()].update({ balance: (recipient.wallet?.[0]?.balance || 0) + recipient.priceTag }).link({ identity: recipient.id })`,
);

fs.writeFileSync("backend/src/createConversation.ts", code);
