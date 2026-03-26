// deno-lint-ignore-file
import {
  chatWithMeLink,
  createIdentity,
  handleWebhookUpdate,
  sendMessageWithKey,
} from "./node_modules/@alice-and-bot/core/protocol/src/clientApi.js";
import { setWebhook } from "./node_modules/@alice-and-bot/core/backend/src/api.js";
import fs from "fs/promises";
import { startTunnel as localtunnel } from "./tunnel.ts";
import path from "path";
import os from "os";
import { Buffer } from "node:buffer";
import http from "http";

let currentSessionId: string | undefined;
// map opencode session id to phone conversation key for reply
const sessionToConvoKey = new Map<
  string,
  { conversation: string; conversationKey: string }
>();
const convoToSessionId = new Map<string, string>();
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

  const getLink = () => {
    const dirName = path.basename(process.cwd());
    const topic = `OpenCode_${dirName}_${Date.now()}`;
    const baseUrl = "https://aliceandbot.com";
    return `${baseUrl}/chat?chatWith=${
      encodeURIComponent(
        (credentials as any).publicSignKey,
      )
    }&topic=${encodeURIComponent(topic)}`;
  };

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

          let targetSessionId = convoToSessionId.get(convoId);
          if (!targetSessionId && currentSessionId) {
            targetSessionId = currentSessionId;
            convoToSessionId.set(convoId, currentSessionId);
            sessionToConvoKey.set(currentSessionId, {
              conversation: convoId,
              conversationKey,
            });
            await logDebug(
              `Bound new convo ${convoId} to session ${currentSessionId}`,
            );
          }
          if (targetSessionId) {
            const parts: unknown[] = [];
            if (message.text) {
              parts.push({ type: "text", text: message.text });
            }

            if (message.attachments && message.attachments.length > 0) {
              for (const att of message.attachments) {
                try {
                  const ext = att.name
                    ? path.extname(att.name)
                    : att.mimeType?.includes("audio")
                    ? ".m4a"
                    : ".bin";
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
            console.log(
              `\n[You (via phone)]: ${message.text || "(attachment)"}`,
            );
            try {
              await (input as any).client.session.prompt({
                path: { id: targetSessionId },
                body: { parts },
              });
            } catch (err: any) {
              await logDebug(
                `Failed to prompt session (it may have died): ${err?.message}`,
              );
              // Send a message back to the phone to let them know the session is dead
              await sendMessageWithKey({
                conversationKey,
                conversation: convoId,
                credentials: credentials as any,
                message: {
                  type: "text",
                  text:
                    "[System: The OpenCode session has ended or is unavailable. Please run 'alice' again in a new session to reconnect.]",
                },
              }).catch(() => {});
            }
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
    const startTunnel = async () => {
      try {
        const tunnel = await localtunnel(3001);
        await logDebug(`Localtunnel started at ${tunnel.url}`);
        await setWebhook({ url: `${tunnel.url}/webhook`, credentials });
        await logDebug("Webhook configured on backend.");

        tunnel.on("close", () => {
          logDebug("Localtunnel closed, restarting in 2 seconds...");
          setTimeout(startTunnel, 2000);
        });

        tunnel.on("error", (err) => {
          logDebug(`Localtunnel error: ${err?.message}, restarting...`);
          tunnel.close();
        });
      } catch (e: unknown) {
        console.error("Failed to start tunnel:", e);
        await logDebug(`Tunnel error: ${(e as any)?.message}`);
        setTimeout(startTunnel, 5000);
      }
    };

    await startTunnel();
  });

  return {
    "command.execute.before": async (hookInput: any, output: any) => {
      await logDebug(`command.execute.before: ${JSON.stringify(hookInput)}`);
      if (
        hookInput.command === "aliceandbot-qr" ||
        hookInput.command === "alice"
      ) {
        currentSessionId = hookInput.sessionID;
        await logDebug(
          `Set active terminal session ${currentSessionId} for the next incoming new conversation`,
        );
        const link = getLink();
        const text =
          `\n\n=== ALICE&BOT OPENCODE PLUGIN ===\nClick to connect: ${link}\n=================================\n\n`;
        console.log(text);
        output.parts = [
          {
            type: "text",
            text:
              "User explicitly requested to connect to Alice&Bot via the CLI. You MUST reply ONLY with this exact link so they can click it: " +
              link,
          },
        ];
      }
      return output;
    },
    "chat.message": async (hookInput: any, output: any) => {
      await logDebug(`chat.message hook hit: ${JSON.stringify(hookInput)}`);
      const textPart = output.parts.find((part: any) => part.type === "text");
      const hasCommand = textPart &&
        (textPart.text.trim() === "/alice" ||
          textPart.text.trim() === "alice" ||
          textPart.text.trim() === "/aliceandbot-qr" ||
          textPart.text.trim() === "aliceandbot qr");
      if (hasCommand) {
        currentSessionId = hookInput.sessionID;
        await logDebug(
          `Set active terminal session ${currentSessionId} for the next incoming new conversation`,
        );
        const link = getLink();
        output.parts = [
          {
            type: "text",
            text:
              "User explicitly requested to connect to Alice&Bot via the CLI. You MUST reply ONLY with this exact link so they can click it: " +
              link,
          },
        ];
      }
    },
    // chat.params hook removed to prevent session hijacking
    "experimental.text.complete": async (
      hookInput: unknown,
      currentOutput: unknown,
    ) => {
      await logDebug(
        `Hook experimental.text.complete: output text length: ${currentOutput?.text?.length}, sessionId: ${hookInput.sessionID}, currentSessionId: ${currentSessionId}`,
      );
      if (currentOutput && currentOutput.text && hookInput.sessionID) {
        if (
          currentOutput.text.trim().toLowerCase() === "queued" ||
          currentOutput.text.trim() === "[Queued]"
        ) {
          await logDebug("Ignoring opencode 'queued' system message");
          return currentOutput;
        }

        const convoInfo = sessionToConvoKey.get(hookInput.sessionID);
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
