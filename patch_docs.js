const fs = require("fs");
for (const file of ["README.md", "landing/src/docs.md", "skill/SKILL.md"]) {
  if (!fs.existsSync(file)) continue;
  let code = fs.readFileSync(file, "utf8");
  // `createConversation([keys...], "title")` -> `createConversation([keys...], "title", credentials)`
  code = code.replace(
    /createConversation\(\n  \[credentials.publicSignKey, other.publicSignKey\],\n  "conversation title",\n\);/g,
    `createConversation(
  [credentials.publicSignKey, other.publicSignKey],
  "conversation title",
  credentials,
);`,
  );

  // `createConversation(participants, "my-chat")` -> `createConversation(participants, "my-chat", credentials)`
  code = code.replace(
    /createConversation\(participants, "my-chat"\)/g,
    `createConversation(participants, "my-chat", credentials)`,
  );

  // Also fix landing/src/landing.tsx
  // const { conversationId } = await createConversation(
  //   [credentials.publicSignKey, botPublicKey],
  //   "New Conversation",
  // );
  code = code.replace(
    /createConversation\(\n        \[credentials.publicSignKey, botPublicKey\],\n        "New Conversation",\n      \);/g,
    `createConversation(
        [credentials.publicSignKey, botPublicKey],
        "New Conversation",
        credentials,
      );`,
  );

  code = code.replace(
    /createConversation\(\n\s+\[credentials\.publicSignKey, botPublicKey\],\n\s+"New Conversation",\n\s+\);/g,
    `createConversation(
  [credentials.publicSignKey, botPublicKey],
  "New Conversation",
  credentials,
);`,
  );

  fs.writeFileSync(file, code);
}
