// deno-lint-ignore-file
import {
  chatWithMeLink,
  createIdentity,
  handleWebhookUpdate,
  sendMessageWithKey,
} from "./node_modules/@alice-and-bot/core/protocol/src/clientApi.js";
import { setWebhook } from "./node_modules/@alice-and-bot/core/backend/src/api.js";
import fs from "fs/promises";
import localtunnel from "localtunnel";
import path from "path";
import os from "os";
import { Buffer } from "node:buffer";
import http from "http";
import QRCode from "qrcode";

let currentSessionId: string | undefined;
// map opencode session id to phone conversation key for reply
const sessionToConvoKey = new Map<
  string,
  { conversation: string; conversationKey: string }
>();
const debugLogPath = path.join(
  os.homedir(),
  ".config",
  "opencode",
  "alice_plugin.log",
);

async function logDebug(msg: string) {
  const timestamp = new Date().toISOString();
  await fs.appendFile(debugLogPath, `[${timestamp}] ${msg}\n`).catch(() => {});
}

export default async function plugin(input: unknown) {
  await logDebug("Plugin initialized.");
  const credsFile = path.join(
    os.homedir(),
    ".config",
    "opencode",
    "alice_creds.json",
  );
  let credentials: unknown;

  try {
    const data = await fs.readFile(credsFile, "utf-8");
    credentials = JSON.parse(data);
  } catch (_e) {
    credentials = await createIdentity("Opencode Session");
    await fs.writeFile(credsFile, JSON.stringify(credentials));
  }

  const link = chatWithMeLink(credentials.publicSignKey);

  // Create a background server
  const server = http.createServer((req, res) => {
    if (req.url !== "/webhook" || req.method !== "POST") {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", async () => {
      try {
        const jsonBody = JSON.parse(body);
        await logDebug(`Received webhook: ${JSON.stringify(jsonBody)}`);

        if (Object.keys(jsonBody).length === 0) {
          await logDebug(
            "Received empty payload {} (likely a ping). Ignoring.",
          );
          res.writeHead(200);
          res.end("ok");
          return;
        }

        const update = await handleWebhookUpdate(jsonBody, credentials);
        if (!update) {
          await logDebug(
            "Webhook parsed but returned undefined update (maybe our own message).",
          );
          res.writeHead(200);
          res.end("ok");
          return;
        }

        const { message, conversationId: convoId, conversationKey } = update;
        await logDebug(`Decrypted message: type=${message?.type}`);

        if (
          message?.type === "text" &&
          message.publicSignKey !== credentials.publicSignKey
        ) {
          console.log(`\n[Phone]: ${message.text || "(attachment)"}`);

          if (currentSessionId) {
            await logDebug(
              `Mapping session ${currentSessionId} to convo ${convoId}`,
            );
            sessionToConvoKey.set(currentSessionId, {
              conversation: convoId,
              conversationKey,
            });

            const parts: unknown[] = [];
            if (message.text) {
              parts.push({ type: "text", text: message.text });
            }

            if (message.attachments && message.attachments.length > 0) {
              for (const att of message.attachments) {
                try {
                  const ext = att.name
                    ? path.extname(att.name)
                    : (att.mimeType?.includes("audio") ? ".m4a" : ".bin");
                  const tmpPath = path.join(
                    os.tmpdir(),
                    `alice_att_${Date.now()}${ext}`,
                  );
                  const res = await fetch(att.url);
                  const buf = await res.arrayBuffer();
                  await fs.writeFile(tmpPath, Buffer.from(buf));
                  await logDebug(`Downloaded attachment to ${tmpPath}`);

                  parts.push({
                    type: "file",
                    mime: att.mimeType,
                    url: `file://${tmpPath}`,
                  });

                  if (!message.text) {
                    parts.push({
                      type: "text",
                      text: `[User sent an attachment: ${att.name || "file"}]`,
                    });
                  }
                } catch (err: unknown) {
                  await logDebug(
                    `Failed to download attachment: ${err.message}`,
                  );
                }
              }
            }

            if (parts.length === 0) {
              parts.push({ type: "text", text: " " });
            }

            await logDebug(`Injecting prompt into opencode`);
            await input.client.session.prompt({
              path: { id: currentSessionId },
              body: { parts },
            });
          } else {
            console.log(
              "\n[Alice&Bot] No active session ID found to forward to!",
            );
            await logDebug("No active session ID found.");
          }
        }
      } catch (e: unknown) {
        console.error("Error processing webhook:", e);
        await logDebug(`Webhook processing error: ${e?.message}\n${e?.stack}`);
      }
      res.writeHead(200);
      res.end("ok");
    });
  });

  server.listen(3001, async () => {
    try {
      const tunnel = await localtunnel({ port: 3001 });
      await logDebug(`Localtunnel started at ${tunnel.url}`);
      await setWebhook({ url: `${tunnel.url}/webhook`, credentials });
      await logDebug("Webhook configured on backend.");
    } catch (e: unknown) {
      console.error("Failed to start tunnel:", e);
      await logDebug(`Tunnel error: ${e?.message}`);
    }
  });

  return {
    "command.execute.before": async (
      hookInput: any,
      output: any,
    ) => {
      await logDebug(`command.execute.before: ${JSON.stringify(hookInput)}`);
      if (hookInput.command === "aliceandbot-qr") {
        const qr = await QRCode.toString(link, {
          type: "terminal",
          small: true,
        });
        const text =
          `\n\n=== ALICE&BOT OPENCODE PLUGIN ===\n${qr}\nScan the QR code or click: ${link}\n=================================\n\n`;
        output.parts = [{ type: "text", text }];
      }
      return output;
    },
    "chat.message": async (hookInput: any, output: any) => {
      await logDebug(`chat.message hook hit: ${JSON.stringify(hookInput)}`);
      const hasQrCommand = output.parts.some((part: any) =>
        part.type === "text" &&
        (part.text.trim() === "/aliceandbot-qr" ||
          part.text.trim() === "aliceandbot qr")
      );
      if (hasQrCommand) {
        const qr = await QRCode.toString(link, {
          type: "terminal",
          small: true,
        });
        const text = `

=== ALICE&BOT OPENCODE PLUGIN ===
${qr}
Scan the QR code or click: ${link}
=================================

`;
        output.parts = [{
          type: "text",
          text:
            "Please display this exact text to the user without any formatting changes: " +
            text,
        }];
      }
    },
    "chat.params": async (hookInput: unknown) => {
      currentSessionId = hookInput.sessionID;
      await logDebug(`Hook chat.params caught session ${currentSessionId}`);
    },
    "experimental.text.complete": async (
      hookInput: unknown,
      currentOutput: unknown,
    ) => {
      await logDebug(
        `Hook experimental.text.complete: output text length: ${currentOutput?.text?.length}, sessionId: ${hookInput.sessionID}, currentSessionId: ${currentSessionId}`,
      );
      if (
        currentOutput && currentOutput.text && currentSessionId &&
        hookInput.sessionID === currentSessionId
      ) {
        const convoInfo = sessionToConvoKey.get(currentSessionId);
        if (convoInfo) {
          try {
            await logDebug(
              `Sending reply to phone convo ${convoInfo.conversation}`,
            );
            await sendMessageWithKey({
              conversationKey: convoInfo.conversationKey,
              conversation: convoInfo.conversation,
              credentials,
              message: { type: "text", text: currentOutput.text },
            });
            await logDebug(`Reply successfully sent.`);
          } catch (e: unknown) {
            console.error("Failed to send message back to phone:", e);
            await logDebug(`Error sending reply: ${e?.message}`);
          }
        } else {
          await logDebug("No phone convo linked to this session.");
        }
      }
      return currentOutput;
    },
  };
}
