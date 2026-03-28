const fs = require("fs");
let code = fs.readFileSync("landing/src/chat.tsx", "utf8");
code = code.replace(
  /const res = await createConversation\(\(\) => adminDb\)\(\n        participantKeys,\n        title,\n      \);/,
  `const res = await createConversation(() => adminDb)(
        participantKeys,
        title,
        credentials
      );`,
);
fs.writeFileSync("landing/src/chat.tsx", code);
