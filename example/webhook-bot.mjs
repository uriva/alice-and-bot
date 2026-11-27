// Minimal E2E encrypted webhook bot for Node.js 20+ (no external HTTP framework).
//
// 1. Install:
//      npm install alice-and-bot
// 2. Create a bot identity once and save its JSON to BOT_CREDENTIALS_JSON,
//    then register your public HTTPS URL with setWebhook({ url, credentials }):
//      BOT_CREDENTIALS_JSON='{"publicSignKey":...}' node example/webhook-bot.mjs
//
// Every incoming webhook is signed by Alice&Bot with Ed25519 and contains an
// E2E encrypted payload that only this bot's private key can decrypt.

import http from "node:http";
import {
  handleWebhookUpdate,
  sendMessageWithKey,
  verifyWebhookOrigin,
} from "alice-and-bot";

const credentials = process.env.BOT_CREDENTIALS_JSON
  ? JSON.parse(process.env.BOT_CREDENTIALS_JSON)
  : null;

if (!credentials) {
  console.error(
    "Set BOT_CREDENTIALS_JSON (from createIdentity()) before starting.",
  );
  process.exit(1);
}

const generateReply = (incomingText) =>
  `Echo (E2E decrypted by webhook bot): ${incomingText}`;

const readJsonBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });

const handlePostWebhook = async (req, res) => {
  const payload = await readJsonBody(req);
  if (!(await verifyWebhookOrigin(payload))) {
    res.writeHead(401).end("Invalid webhook signature");
    return;
  }

  const { message, conversationKey, conversationId } =
    await handleWebhookUpdate(payload, credentials);

  if (
    message.type !== "text" ||
    message.publicSignKey === credentials.publicSignKey
  ) {
    res.writeHead(200).end("ignored");
    return;
  }

  const spinnerId = crypto.randomUUID();
  await sendMessageWithKey({
    conversationKey,
    conversation: conversationId,
    credentials,
    message: {
      type: "spinner",
      text: "Thinking...",
      active: true,
      elementId: spinnerId,
    },
  });

  const replyText = generateReply(message.text);

  await sendMessageWithKey({
    conversationKey,
    conversation: conversationId,
    credentials,
    message: {
      type: "spinner",
      text: "Thinking...",
      active: false,
      elementId: spinnerId,
    },
  });

  await sendMessageWithKey({
    conversationKey,
    conversation: conversationId,
    credentials,
    message: { type: "text", text: replyText },
  });

  res.writeHead(200).end("ok");
};

const port = Number(process.env.PORT ?? 8787);

http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/webhook") {
    handlePostWebhook(req, res).catch((err) => {
      console.error("Webhook error:", err);
      res.writeHead(500).end("error");
    });
    return;
  }
  res.writeHead(200).end("Alice&Bot webhook server running");
}).listen(port, () => {
  console.log(`Webhook bot listening on http://localhost:${port}/webhook`);
});
