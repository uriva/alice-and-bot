const fs = require("fs");
let code = fs.readFileSync("backend/src/api.ts", "utf8");

code = code.replace(
  /\{ profile: \{ name\?: string; avatar\?: string; alias\?: string \} \| null \}/,
  `{ profile: { name?: string; avatar?: string; alias?: string; priceTag?: number } | null }`,
);
fs.writeFileSync("backend/src/api.ts", code);
