const fs = require("fs");
let code = fs.readFileSync("clients/react/src/hooks.ts", "utf8");

code = code.replace(
  /const \{ name, avatar, alias \} = identity;\n    return \{ name, avatar, alias \};/,
  `const { name, avatar, alias, priceTag } = identity;
    return { name, avatar, alias, priceTag };`,
);
fs.writeFileSync("clients/react/src/hooks.ts", code);
