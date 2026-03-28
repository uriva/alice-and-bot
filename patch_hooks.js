const fs = require("fs");
let code = fs.readFileSync("clients/react/src/hooks.ts", "utf8");
code = code.replace(
  /createConversation\(adminDb\)\(fixedParticipants, "Chat"\)\.then/,
  'createConversation(adminDb)(fixedParticipants, "Chat", credentials).then',
);
fs.writeFileSync("clients/react/src/hooks.ts", code);
