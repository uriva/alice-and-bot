const fs = require("fs");
let code = fs.readFileSync("landing/src/chat.tsx", "utf8");

code = code.replace(
  /setAlias,\n  setName,\n\} from "\.\.\/\.\.\/protocol\/src\/clientApi\.ts";/,
  `setAlias,\n  setName,\n  setPriceTagSigned,\n  getBalanceAndTransactionsSigned,\n} from "../../protocol/src/clientApi.ts";`,
);

fs.writeFileSync("landing/src/chat.tsx", code);
