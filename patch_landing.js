const fs = require("fs");
let code = fs.readFileSync("landing/src/landing.tsx", "utf8");
code = code.replace(
  /const \{ conversationId \} = await createConversation\(\n  \[alice\.publicSignKey, bot\.publicSignKey\],\n  "Hello",\n\);/,
  `const { conversationId } = await createConversation(
  [alice.publicSignKey, bot.publicSignKey],
  "Hello",
  alice,
);`,
);
fs.writeFileSync("landing/src/landing.tsx", code);
