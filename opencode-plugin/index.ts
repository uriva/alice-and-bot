// deno-lint-ignore-file
import {
  chatWithMeLink,
  createIdentity,
  handleWebhookUpdate,
  sendMessageWithKey,
} from "./node_modules/@alice-and-bot/core/protocol/src/clientApi.js";
import { setWebhook } from "./node_modules/@alice-and-bot/core/backend/src/api.js";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { Buffer } from "node:buffer";

import qrcode from "qrcode-terminal";
import clipboardy from "clipboardy";

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

  const getLink = (sessionTitle?: string) => {
    const dirName = path.basename(process.cwd());
    const fallbackTopic = `OpenCode_${dirName}_${Date.now()}`;
    const topic = sessionTitle ? sessionTitle : fallbackTopic;
    const baseUrl = "https://aliceandbot.com";
    return `${baseUrl}/chat?chatWith=${
      encodeURIComponent(
        (credentials as any).publicSignKey,
      )
    }&topic=${encodeURIComponent(topic)}`;
  };

  
  const pubKey = encodeURIComponent((credentials as any).publicSignKey);
  const webhookUrl = `https://api.aliceandbot.com/relay/webhook/${pubKey}`;
  
  let reconnectTimer: any;
  const setupWebSocket = () => {
    const wsUrl = `wss://api.aliceandbot.com/relay/ws/${pubKey}`;
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = async () => {
      await logDebug(`Connected to WebSocket relay at ${wsUrl}`);
      await setWebhook({ url: webhookUrl, credentials });
      await logDebug("Webhook URL registered on backend for WS relay.");
    };
    
    ws.onmessage = async (event) => {
      try {
        const jsonBody = JSON.parse(event.data.toString());
        await logDebug(`Received message from WS relay: ${JSON.stringify(jsonBody).slice(0, 100)}...`);
        
        if (Object.keys(jsonBody).length === 0) {
          return;
        }

        const update = await handleWebhookUpdate(jsonBody, credentials);
        if (!update) return;

        const { message, conversationId: convoId, conversationKey } = update;
        await logDebug(`Decrypted message: type=${message?.type}`);

        if (
          message?.type === "text" &&
          message.publicSignKey !== (credentials as any).publicSignKey
        ) {
          await logDebug(`[Phone]: ${message.text || "(attachment)"}`);

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
                    `Failed to download attachment: ${(err as Error).message}`,
                  );
                }
              }
            }

            if (parts.length === 0) {
              parts.push({ type: "text", text: " " });
            }

            await logDebug(
              `Injecting prompt into opencode: ${
                message.text || "(attachment)"
              }`,
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
            await logDebug("No active session ID found to forward to.");
          }
        }
      } catch (err) {
        await logDebug(`WebSocket message error: ${err}`);
      }
    };
    
    ws.onclose = () => {
      logDebug("WebSocket closed, reconnecting in 5 seconds...");
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(setupWebSocket, 5000);
    };
    
    ws.onerror = (err) => {
      logDebug(`WebSocket error: ${err}`);
    };
  };

  if (!(globalThis as any).__aliceWebSocket) {
    (globalThis as any).__aliceWebSocket = true;
    setupWebSocket();
  }

const client = (input as any).client;

  const showAliceLink = async (sessionId: string) => {
    currentSessionId = sessionId;
    await logDebug(`Set active session ${sessionId}`);

    let sessionTitle: string | undefined;
    try {
      const session = await client.session.get({ path: { id: sessionId } });
      sessionTitle = session?.data?.info?.title || session?.data?.title ||
        session?.info?.title || session?.title;
    } catch (e) {
      await logDebug(`Could not fetch session title: ${e}`);
    }

    const link = getLink(sessionTitle);

    try {
      clipboardy.writeSync(link);
    } catch (err) {
      await logDebug(`Failed to copy to clipboard: ${err}`);
    }

    await client.tui.showToast({
      body: { message: `Alice&Bot link copied! ${link}`, variant: "success" },
    }).catch((e: any) => logDebug(`Toast failed: ${e?.message}`));

    await logDebug(`Alice&Bot link: ${link}`);
  };

  const aliceCommands = [
    "/alice",
    "alice",
    "/aliceandbot-qr",
    "aliceandbot qr",
    "/aliceandbot",
    "aliceandbot",
    "ALICE_AND_BOT_COMMAND_INTERNAL",
  ];

  return {
    event: async ({ event }: any) => {
      if (
        event.type === "tui.command.execute" &&
        aliceCommands.includes(event.properties?.command?.trim())
      ) {
        await showAliceLink(
          event.properties?.sessionID || currentSessionId || "",
        );
      }
    },
    "chat.message": async (hookInput: any, output: any) => {
      const textPart = output.parts?.find((part: any) => part.type === "text");
      const trimmed = textPart?.text?.trim() || "";
      if (aliceCommands.includes(trimmed)) {
        await showAliceLink(hookInput.sessionID);
        output.parts.length = 0;
        try {
          await client.session.abort({ path: { id: hookInput.sessionID } });
        } catch (e: any) {
          await logDebug(`Failed to abort session: ${e?.message}`);
        }
        throw {
          name: "MessageAbortedError",
          data: { message: "Command handled locally by Alice&Bot plugin" },
        };
      }
      return output;
    },
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
            await logDebug(`Error sending reply: ${(e as Error)?.message}`);
          }
        } else {
          await logDebug("No phone convo linked to this session.");
        }
      }
      return currentOutput;
    },
  };
}
