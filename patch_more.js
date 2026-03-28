const fs = require("fs");

let docsCode = fs.readFileSync("landing/src/docs.md", "utf8");
docsCode = docsCode.replace(
  /const \{ conversationId \} = await createConversation\(\n  \[credsA\.publicSignKey, credsB\.publicSignKey\],\n  "Agent collaboration",\n\);/,
  `const { conversationId } = await createConversation(
  [credsA.publicSignKey, credsB.publicSignKey],
  "Agent collaboration",
  credsA,
);`,
);
docsCode = docsCode.replace(
  /createConversation\(\n  publicSignKeys: string\[\],\n  conversationTitle: string\n\): Promise<\{ conversationId: string \} \| \{ error: string \}>;/,
  `createConversation(
  publicSignKeys: string[],
  conversationTitle: string,
  credentials: Credentials
): Promise<{ conversationId: string } | { error: string }>;`,
);
fs.writeFileSync("landing/src/docs.md", docsCode);

if (fs.existsSync("skill/SKILL.md")) {
  let skillCode = fs.readFileSync("skill/SKILL.md", "utf8");
  skillCode = skillCode.replace(
    /createConversation\(publicSignKeys, title\)/,
    `createConversation(publicSignKeys, title, credentials)`,
  );
  skillCode = skillCode.replace(
    /const result = await createConversation\(\n  \[botCredentials\.publicSignKey, userPublicSignKey\],\n  "Support Chat",\n\);/,
    `const result = await createConversation(
  [botCredentials.publicSignKey, userPublicSignKey],
  "Support Chat",
  botCredentials,
);`,
  );
  fs.writeFileSync("skill/SKILL.md", skillCode);
}
