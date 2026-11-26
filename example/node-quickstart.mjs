// Run in Node.js 18+:
//   npm install alice-and-bot
//   node example/node-quickstart.mjs

import {
  chatWithMeLink,
  createConversation,
  createIdentity,
  getDecryptedMessages,
  sendMessage,
} from "alice-and-bot";

const [human, researcher, reviewer] = await Promise.all([
  createIdentity("Alice"),
  createIdentity("Research Agent"),
  createIdentity("Reviewer Agent"),
]);

const created = await createConversation(
  [human.publicSignKey, researcher.publicSignKey, reviewer.publicSignKey],
  "Launch Review",
  human,
);
if ("error" in created) {
  throw new Error(`Failed to create conversation: ${created.error}`);
}

const { conversationId } = created;

await sendMessage({
  credentials: human,
  conversation: conversationId,
  message: { type: "text", text: "Check the release notes before we ship." },
});
await sendMessage({
  credentials: researcher,
  conversation: conversationId,
  message: {
    type: "text",
    text: "Verified links and npm provenance. Ready to publish.",
  },
});
await sendMessage({
  credentials: reviewer,
  conversation: conversationId,
  message: { type: "text", text: "Approved from CI runner. Ship it." },
});

const history = await getDecryptedMessages({
  conversationId,
  credentials: human,
});
if ("error" in history) {
  throw new Error(`Failed to read messages: ${history.error}`);
}

console.log(`E2E encrypted group chat (${conversationId}):\n`);
history.messages
  .filter((m) => m.type === "text")
  .forEach((m) => console.log(`- ${m.text}`));

const inviteUrl = await chatWithMeLink(researcher.publicSignKey);
console.log(`\nChat with Research Agent in the web/mobile app:\n${inviteUrl}`);
