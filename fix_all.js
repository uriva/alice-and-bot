const fs = require("fs");

let main = fs.readFileSync("backend/src/main.ts", "utf8");
main = main.replace(
  /identities: \{\n          receivedTransactions: \{\},\n          sentTransactions: \{\},\n          \$: \{ where: \{ publicSignKey \} \},\n        \},/,
  `identities: {
          wallet: {},
          receivedTransactions: {},
          sentTransactions: {},
          $: { where: { publicSignKey } },
        },`,
);
main = main.replace(
  /identities: \{\n          \$: \{ where: \{ publicSignKey \} \},\n        \},/,
  `identities: {
          wallet: {},
          $: { where: { publicSignKey } },
        },`,
);
main = main.replace(
  /identity\.wallet\?\.\[0\]\?\.balance/g,
  "identity.wallet?.balance",
);
main = main.replace(/identity\.wallet\?\.\[0\]\?\.id/g, "identity.wallet?.id");
main = main.replace(/identity\.balance/g, "identity.wallet?.balance");
fs.writeFileSync("backend/src/main.ts", main);

let cc = fs.readFileSync("backend/src/createConversation.ts", "utf8");
cc = cc.replace(
  /recipient\.wallet\?\.\[0\]\?\.balance/g,
  "recipient.wallet?.balance",
);
cc = cc.replace(/recipient\.wallet\?\.\[0\]\?\.id/g, "recipient.wallet?.id");
cc = cc.replace(
  /sender\.wallet\?\.\[0\]\?\.balance/g,
  "sender.wallet?.balance",
);
cc = cc.replace(/sender\.wallet\?\.\[0\]\?\.id/g, "sender.wallet?.id");
fs.writeFileSync("backend/src/createConversation.ts", cc);

let cp = fs.readFileSync("backend/src/cryptoPayment.ts", "utf8");
cp = cp.replace(
  /identity\.wallet\?\.\[0\]\?\.balance/g,
  "identity.wallet?.balance",
);
cp = cp.replace(/identity\.wallet\?\.\[0\]\?\.id/g, "identity.wallet?.id");
fs.writeFileSync("backend/src/cryptoPayment.ts", cp);
