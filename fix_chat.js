const fs = require("fs");
let code = fs.readFileSync("landing/src/chat.tsx", "utf8");
code = code.replace(/credentials,\n        credentials/, "credentials");
fs.writeFileSync("landing/src/chat.tsx", code);
