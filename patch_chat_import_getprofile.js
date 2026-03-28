const fs = require("fs");
let code = fs.readFileSync("landing/src/chat.tsx", "utf8");

code = code.replace(
  /getBalanceAndTransactionsSigned,\n\} from "\.\.\/\.\.\/protocol\/src\/clientApi\.ts";/,
  `getBalanceAndTransactionsSigned,\n  getProfile,\n} from "../../protocol/src/clientApi.ts";`,
);
fs.writeFileSync("landing/src/chat.tsx", code);
