// deno-lint-ignore-file no-explicit-any

const conversationId = Deno.args[0];

if (!conversationId) {
  console.log(
    "Usage: deno run -A test_interactive_stream_prod.ts <conversationId>",
  );
  Deno.exit(1);
}

const botId = "bot";
const elementId = "test-bot-reply-" + Date.now();

async function main() {
  console.log(`\n======================================================`);
  console.log(`🔥 OPEN THIS LINK NOW TO SEE THE STREAM 🔥`);
  console.log(`👉  https://aliceandbot.com/chat?c=${conversationId}`);
  console.log(`======================================================\n`);

  console.log(
    `Waiting 10 seconds for you to open the link...`,
  );
  for (let i = 10; i > 0; i--) {
    console.log(`${i}...`);
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`\nInjecting stream into the conversation: ${conversationId}`);
  console.log(`Using Bot ID: ${botId}\n`);

  const textToStream =
    "Hello there! The frontend bug is definitely solved. You should see this streaming in smoothly without reloading the page!";
  const words = textToStream.split(" ");
  let currentText = "";

  for (let i = 0; i < words.length; i++) {
    currentText += (i === 0 ? "" : " ") + words[i];
    const delay = Math.floor(Math.random() * 400) + 150;

    await fetch("https://api.aliceandbot.com/ui-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        elementId,
        conversationId,
        type: "stream",
        text: currentText,
        active: true,
        authorId: botId,
      }),
    });

    console.log(`Streamed: ${currentText}`);
    await new Promise((r) => setTimeout(r, delay));
  }

  await fetch("https://api.aliceandbot.com/ui-update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      elementId,
      conversationId,
      type: "stream",
      text: currentText,
      active: false,
      authorId: botId,
    }),
  });

  console.log("\n✅ Stream complete!");
  Deno.exit(0);
}

main();
