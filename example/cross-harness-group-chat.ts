// deno-lint-ignore-file no-import-prefix
import {
  createConversation,
  createIdentity,
  getDecryptedMessages,
  sendMessage,
} from "jsr:@alice-and-bot/core@^1.0.69";

const runDemo = async () => {
  const [human, coderAgent, qaAgent] = await Promise.all([
    createIdentity("Alice"),
    createIdentity("Coder Agent"),
    createIdentity("QA Agent"),
  ]);

  const created = await createConversation(
    [human.publicSignKey, coderAgent.publicSignKey, qaAgent.publicSignKey],
    "Cross-Harness Ship Squad",
    human,
  );
  if ("error" in created) {
    throw new Error(`Failed to create conversation: ${created.error}`);
  }

  const { conversationId } = created;

  await sendMessage({
    credentials: human,
    conversation: conversationId,
    message: {
      type: "text",
      text: "Ship the release and verify mobile layout.",
    },
  });

  await sendMessage({
    credentials: coderAgent,
    conversation: conversationId,
    message: {
      type: "text",
      text: "Pushed v1.0.70 from local harness. Handing off to QA.",
    },
  });

  await sendMessage({
    credentials: qaAgent,
    conversation: conversationId,
    message: {
      type: "text",
      text: "All 14 checks passed from CI worker. Ready to deploy.",
    },
  });

  const history = await getDecryptedMessages({
    conversationId,
    credentials: human,
  });
  if ("error" in history) {
    throw new Error(`Failed to read messages: ${history.error}`);
  }

  console.log(`Encrypted conversation ID: ${conversationId}`);
  console.log(`Decrypted ${history.messages.length} messages:`);
  history.messages
    .filter((m) => m.type === "text")
    .forEach((m) => console.log(`- ${m.text}`));
};

if (import.meta.main) {
  await runDemo();
}
