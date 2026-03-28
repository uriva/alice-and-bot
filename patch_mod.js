const fs = require("fs");
let code = fs.readFileSync("mod.ts", "utf8");
code = code.replace(
  /export const createConversation: \(\n  publicSignKeys: string\[\],\n  conversationTitle: string,\n\) => Promise<\{ conversationId: string \} \| \{ error: string \}> =/,
  `export const createConversation: (
  publicSignKeys: string[],
  conversationTitle: string,
  credentials: Credentials,
) => Promise<{ conversationId: string } | { error: string }> =`,
);
fs.writeFileSync("mod.ts", code);
