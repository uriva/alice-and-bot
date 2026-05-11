// deno-lint-ignore-file
import {
  buildUiUpdateUrl,
  chatWithMeLink,
  createIdentity,
  handleWebhookUpdate,
  sendMessageWithKey,
} from "./node_modules/@alice-and-bot/core/protocol/src/clientApi.js";
import {
  sendTyping,
  setWebhook,
} from "./node_modules/@alice-and-bot/core/backend/src/api.js";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { Buffer } from "node:buffer";

import qrcode from "qrcode-terminal";
import clipboardy from "clipboardy";
import { promptWasAcceptedDespiteError } from "./prompt.ts";
import {
  answersFromQuestionReplyText,
  formatQuestionRequest,
} from "./question.ts";
import { reasoningStreamUpdate } from "./reasoning.ts";
import { isWebhookEnvelope } from "./relay.ts";

let currentSessionId: string | undefined;
const aliceCommands = new Set([
  "/alice",
  "alice",
  "/aliceandbot-qr",
  "aliceandbot qr",
  "/aliceandbot",
  "aliceandbot",
  "ALICE_AND_BOT_COMMAND_INTERNAL",
]);
const tuiCommandAliases: Record<string, string> = {
  "/share": "session_share",
  "/interrupt": "session_interrupt",
  "/compact": "session_compact",
  "/clear": "input_clear",
};
// map opencode session id to phone conversation key for reply
const sessionToConvoKey = new Map<
  string,
  { conversation: string; conversationKey: string }
>();
const convoToSessionId = new Map<string, string>();
const pendingPermissions = new Map<
  string,
  { requestId: string; sessionId: string; description: string }
>();
const pendingQuestions = new Map<string, any>();
const sentReasoningParts = new Set<string>();
const seenAliceMessageIds = new Set<string>();
const sentCompletionKeys = new Set<string>();
const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
const typingSessions = new Set<string>();
const sessionToActiveMessageId = new Map<string, string>();
const sessionToLastMessageId = new Map<string, string>();
const sessionSwitchCodes = new Map<string, string>();
const switchCodeToSessionId = new Map<string, string>();
const rememberedSetMax = 500;
const typingFallbackMs = 60000;
const completionDuplicateWindowMs = 10000;
const permissionReplyCommands: Record<string, "once" | "always" | "reject"> = {
  "/yes": "once",
  "/y": "once",
  "/allow": "once",
  "/approve": "once",
  "/no": "reject",
  "/n": "reject",
  "/deny": "reject",
  "/reject": "reject",
  "/always": "always",
};
const debugLogPath = path.join(
  os.homedir(),
  ".config",
  "opencode",
  "alice_plugin.log",
);
const statePath = path.join(
  os.homedir(),
  ".config",
  "opencode",
  "alice_plugin_state.json",
);
const seenMessageDir = path.join(
  os.homedir(),
  ".config",
  "opencode",
  "alice_seen_messages",
);

async function logDebug(msg: string) {
  const timestamp = new Date().toISOString();
  await fs.appendFile(debugLogPath, `[${timestamp}] ${msg}\n`).catch(() => {});
}

const loadState = async () => {
  try {
    const raw = await fs.readFile(statePath, "utf-8");
    const state = JSON.parse(raw);
    if (state.currentSessionId) currentSessionId = state.currentSessionId;
    if (state.sessionToConvoKey) {
      Object.entries(state.sessionToConvoKey).forEach(([k, v]) =>
        sessionToConvoKey.set(k, v as any)
      );
    }
    if (state.convoToSessionId) {
      Object.entries(state.convoToSessionId).forEach(([k, v]) =>
        convoToSessionId.set(k, v as string)
      );
    }
    await logDebug(
      `Loaded persisted state: currentSessionId=${currentSessionId}, sessions=${sessionToConvoKey.size}, convos=${convoToSessionId.size}`,
    );
  } catch {
    await logDebug("No persisted state found (first run or corrupted file).");
  }
};

const saveState = () =>
  fs.writeFile(
    statePath,
    JSON.stringify({
      currentSessionId,
      sessionToConvoKey: Object.fromEntries(sessionToConvoKey),
      convoToSessionId: Object.fromEntries(convoToSessionId),
    }),
  ).catch(() => {});

const claimAliceMessage = async (messageId: string) => {
  await fs.mkdir(seenMessageDir, { recursive: true }).catch(() => {});
  try {
    const handle = await fs.open(
      path.join(seenMessageDir, encodeURIComponent(messageId)),
      "wx",
    );
    await handle.close();
    return true;
  } catch {
    return false;
  }
};

const getMessageText = (message: any) => message?.text?.trim() || "";

const rememberOnce = (set: Set<string>, key: string) => {
  if (set.has(key)) return false;
  set.add(key);
  const oldest = set.values().next().value;
  if (set.size > rememberedSetMax && oldest) set.delete(oldest);
  return true;
};

const trimLine = (text: string, max = 60) =>
  text.length <= max ? text : `${text.slice(0, max - 1)}…`;

const sessionCode = (sessionId: string) => {
  const existing = sessionSwitchCodes.get(sessionId);
  if (existing) return existing;
  const code = (sessionSwitchCodes.size + 1).toString(36);
  sessionSwitchCodes.set(sessionId, code);
  switchCodeToSessionId.set(code, sessionId);
  return code;
};

const sessionTitle = (session: any) =>
  session?.data?.info?.title || session?.data?.title || session?.info?.title ||
  session?.title || session?.id || session?.sessionID || "Untitled session";

const sessionIdOf = (session: any) =>
  session?.id || session?.sessionID || session?.data?.id ||
  session?.data?.sessionID;

const sessionsFromResult = (result: any) =>
  result?.data?.sessions || result?.data || result?.sessions || result || [];

const listSessions = async (client: any) => {
  const method = client?.session?.list;
  if (typeof method !== "function") return [];
  const result = await callFirstAvailable([
    () => method.call(client.session, {}),
    () => method.call(client.session),
  ]);
  return Array.isArray(sessionsFromResult(result))
    ? sessionsFromResult(result)
    : [];
};

const getSession = async ({ client, sessionId }: {
  client: any;
  sessionId: string;
}) => {
  const method = client?.session?.get;
  if (typeof method !== "function") return undefined;
  return await callFirstAvailable([
    () => method.call(client.session, { path: { id: sessionId } }),
    () => method.call(client.session, { sessionID: sessionId }),
  ]);
};

const questionsFromResult = (result: any) =>
  result?.data?.questions || result?.data || result?.questions || result || [];

const pendingQuestionForSession = async ({ client, sessionId }: {
  client: any;
  sessionId: string;
}) => {
  const existing = pendingQuestions.get(sessionId);
  if (existing) return existing;
  const method = client?.question?.list;
  if (typeof method !== "function") return;
  const result = await callFirstAvailable([
    () => method.call(client.question, {}),
    () => method.call(client.question),
  ]).catch(() => undefined);
  const request = questionsFromResult(result).find((question: any) =>
    question?.sessionID === sessionId
  );
  if (request) pendingQuestions.set(sessionId, request);
  return request;
};

const completionKey = ({ hookInput, currentOutput }: {
  hookInput: any;
  currentOutput: any;
}) =>
  sessionToActiveMessageId.has(hookInput?.sessionID)
    ? `${hookInput?.sessionID}:${
      sessionToActiveMessageId.get(hookInput?.sessionID)
    }`
    : sessionToLastMessageId.has(hookInput?.sessionID)
    ? `${hookInput?.sessionID}:${
      sessionToLastMessageId.get(hookInput?.sessionID)
    }`
    : currentOutput?.id || currentOutput?.messageID ||
      currentOutput?.messageId ||
      hookInput?.messageID || hookInput?.messageId ||
      `${hookInput?.sessionID ?? "unknown"}:${currentOutput?.text ?? ""}`;

const markSessionMessageCompleted = (sessionId: string) => {
  sessionToActiveMessageId.delete(sessionId);
  setTimeout(() => {
    if (!sessionToActiveMessageId.has(sessionId)) {
      sessionToLastMessageId.delete(sessionId);
    }
  }, completionDuplicateWindowMs);
};

const sendUiUpdate = async (body: Record<string, unknown>) => {
  await fetch(buildUiUpdateUrl(String(body.elementId)), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
};

const parsePhoneCommand = (text: string) => {
  if (!text.startsWith("/")) return;
  const [rawCommand, ...rest] = text.split(/\s+/);
  const command = rawCommand.slice(1).trim();
  if (!command) return;
  return {
    raw: rawCommand,
    command,
    arguments: rest.join(" ").trim(),
  };
};

const formatPermissionDescription = ({
  permission,
  metadata,
}: {
  permission: string;
  metadata: Record<string, unknown>;
}) => {
  const details = Object.entries(metadata || {})
    .filter(([, v]) => typeof v === "string")
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
  return details ? `${permission} (${details})` : permission;
};

const notifyPhone = async ({
  conversation,
  conversationKey,
  credentials,
  text,
}: {
  conversation: string;
  conversationKey: string;
  credentials: unknown;
  text: string;
}) => {
  await sendMessageWithKey({
    conversation,
    conversationKey,
    credentials: credentials as any,
    message: { type: "text", text },
  });
};

const clearTyping = async ({
  conversation,
  publicSignKey,
  sessionId,
}: {
  conversation: string;
  publicSignKey: string;
  sessionId: string;
}) => {
  clearTimeout(typingTimers.get(sessionId));
  typingTimers.delete(sessionId);
  typingSessions.delete(sessionId);
  await sendTyping({ conversation, isTyping: false, publicSignKey }).catch(
    () => {},
  );
};

const startTyping = async ({
  conversation,
  publicSignKey,
  sessionId,
}: {
  conversation: string;
  publicSignKey: string;
  sessionId: string;
}) => {
  clearTimeout(typingTimers.get(sessionId));
  typingSessions.add(sessionId);
  await sendTyping({ conversation, isTyping: true, publicSignKey }).catch(
    () => {},
  );
  typingTimers.set(
    sessionId,
    setTimeout(() => {
      clearTyping({ conversation, publicSignKey, sessionId });
    }, typingFallbackMs),
  );
};

const callFirstAvailable = async (
  calls: Array<() => Promise<unknown>>,
) => {
  let lastError: unknown;
  for (const call of calls) {
    try {
      return await call();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
};

const executeTuiAction = async ({
  client,
  action,
}: {
  client: any;
  action: "openHelp" | "openSessions" | "openThemes" | "openModels";
}) => {
  const method = client?.tui?.[action];
  if (typeof method !== "function") return false;
  await callFirstAvailable([
    () => method(),
    () => method({}),
  ]);
  return true;
};

const executeTuiCommand = async ({
  client,
  command,
}: {
  client: any;
  command: string;
}) => {
  const method = client?.tui?.executeCommand;
  if (typeof method !== "function") return false;
  await callFirstAvailable([
    () => method({ command }),
    () => method({ body: { command } }),
  ]);
  return true;
};

const executeSessionCommand = async ({
  client,
  sessionId,
  command,
  argumentsText,
}: {
  client: any;
  sessionId: string;
  command: string;
  argumentsText: string;
}) => {
  const method = client?.session?.command;
  if (typeof method !== "function") return false;
  await callFirstAvailable([
    () =>
      method({
        sessionID: sessionId,
        command,
        arguments: argumentsText,
      }),
    () =>
      method({
        path: { id: sessionId },
        body: { command, arguments: argumentsText },
      }),
  ]);
  return true;
};

const runPhoneCommand = async ({
  client,
  getLink,
  sessionId,
  text,
}: {
  client: any;
  getLink: (sessionTitle?: string) => string;
  sessionId: string;
  text: string;
}) => {
  const parsed = parsePhoneCommand(text);
  if (!parsed) return false;

  if (parsed.raw === "/sessions") {
    const sessions = await listSessions(client);
    if (!sessions.length) {
      return { handled: true, reply: "No OpenCode sessions found." };
    }
    const lines = sessions.map((session: any) => {
      const id = sessionIdOf(session);
      const marker = id === currentSessionId ? "*" : "";
      return `${sessionCode(id)} ${marker}${trimLine(sessionTitle(session))}`;
    });
    return {
      handled: true,
      reply: `OpenCode sessions:\n${
        lines.join("\n")
      }\n\nReply /switch <code> to switch.`,
    };
  }

  if (parsed.raw === "/switch") {
    const targetSessionId = switchCodeToSessionId.get(parsed.arguments);
    if (!targetSessionId) {
      return {
        handled: true,
        reply: "Unknown session code. Send /sessions to list current codes.",
      };
    }
    currentSessionId = targetSessionId;
    const session = await getSession({ client, sessionId: targetSessionId });
    const link = getLink(sessionTitle(session));
    await saveState();
    return {
      handled: true,
      reply:
        `Open this link to start a chat tied to session ${parsed.arguments}:\n${link}`,
    };
  }

  if (parsed.raw === "/models") {
    if (await executeTuiAction({ client, action: "openModels" })) {
      return { handled: true, reply: "Opened the model picker in OpenCode." };
    }
  }

  if (parsed.raw === "/themes") {
    if (await executeTuiAction({ client, action: "openThemes" })) {
      return { handled: true, reply: "Opened the theme picker in OpenCode." };
    }
  }

  if (parsed.raw === "/help") {
    if (await executeTuiAction({ client, action: "openHelp" })) {
      return { handled: true, reply: "Opened the help dialog in OpenCode." };
    }
  }

  if (parsed.raw === "/abort") {
    const abort = client?.session?.abort;
    if (typeof abort === "function") {
      await callFirstAvailable([
        () => abort({ sessionID: sessionId }),
        () => abort({ path: { id: sessionId } }),
      ]);
      return { handled: true, reply: "Aborted the active OpenCode run." };
    }
  }

  const tuiAlias = tuiCommandAliases[parsed.raw];
  if (tuiAlias && await executeTuiCommand({ client, command: tuiAlias })) {
    return { handled: true, reply: `Executed ${parsed.raw} in OpenCode.` };
  }

  if (
    await executeSessionCommand({
      client,
      sessionId,
      command: parsed.command,
      argumentsText: parsed.arguments,
    })
  ) {
    return { handled: true };
  }

  return {
    handled: true,
    reply:
      `Couldn't run ${parsed.raw} from the plugin runtime. Try the command in OpenCode directly.`,
  };
};

const buildPromptParts = async (message: any) => {
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

  return parts;
};

export default async function plugin(input: unknown) {
  await logDebug("Plugin initialized.");
  await loadState();
  const configDir = path.join(os.homedir(), ".config", "opencode");
  const credsFile = path.join(configDir, "alice_creds.json");
  const stateFile = path.join(configDir, "alice_state.json");
  let credentials: unknown;

  try {
    const data = await fs.readFile(credsFile, "utf-8");
    credentials = JSON.parse(data);
  } catch (_e) {
    credentials = await createIdentity("Opencode Session");
    await fs.writeFile(credsFile, JSON.stringify(credentials));
  }

  let relayToken: string;
  try {
    const stateData = JSON.parse(await fs.readFile(stateFile, "utf-8"));
    relayToken = stateData.relayToken;
  } catch (_e) {
    relayToken = crypto.randomUUID();
    await fs.writeFile(stateFile, JSON.stringify({ relayToken }));
  }
  await logDebug(`Using relay token: ${relayToken}`);

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

  const webhookUrl = `https://api.aliceandbot.com/relay/webhook/${relayToken}`;

  const setupWebSocket = () => {
    const wsUrl = `wss://api.aliceandbot.com/relay/ws/${relayToken}`;
    const ws = new WebSocket(wsUrl);

    let pingInterval: any;
    let lastMessageReceivedAt = Date.now();
    const STALE_THRESHOLD_MS = 90000;

    ws.onopen = async () => {
      await logDebug(`Connected to WebSocket relay at ${wsUrl}`);
      lastMessageReceivedAt = Date.now();
      const res = await setWebhook({ url: webhookUrl, credentials });
      await logDebug(`setWebhook response: ${JSON.stringify(res)}`);
      await logDebug("Webhook URL registered on backend for WS relay.");
      pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          const staleDuration = Date.now() - lastMessageReceivedAt;
          if (staleDuration > STALE_THRESHOLD_MS) {
            logDebug(
              `WebSocket stale for ${staleDuration}ms, force-closing to reconnect`,
            );
            ws.close();
            return;
          }
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, 30000);
    };

    ws.onmessage = async (event) => {
      lastMessageReceivedAt = Date.now();
      try {
        const jsonBody = JSON.parse(event.data.toString());
        if (jsonBody.type === "pong") return;
        if (!isWebhookEnvelope(jsonBody)) return;
        await logDebug(
          `Received message from WS relay: ${
            JSON.stringify(jsonBody).slice(0, 100)
          }...`,
        );

        if (Object.keys(jsonBody).length === 0) {
          return;
        }

        const update = await handleWebhookUpdate(jsonBody, credentials);
        if (!update) return;

        const { message, conversationId: convoId, conversationKey, messageId } =
          update;
        await logDebug(`Decrypted message: type=${message?.type}`);

        if (
          message?.type === "text" &&
          message.publicSignKey !== (credentials as any).publicSignKey
        ) {
          if (
            !rememberOnce(seenAliceMessageIds, messageId) ||
            !await claimAliceMessage(messageId)
          ) {
            await logDebug(`Ignoring duplicate Alice messageId=${messageId}`);
            return;
          }
          await logDebug(`[Phone]: ${message.text || "(attachment)"}`);

          let targetSessionId = convoToSessionId.get(convoId);
          if (!targetSessionId && currentSessionId) {
            targetSessionId = currentSessionId;
            convoToSessionId.set(convoId, currentSessionId);
            sessionToConvoKey.set(currentSessionId, {
              conversation: convoId,
              conversationKey,
            });
            await saveState();
            await logDebug(
              `Bound new convo ${convoId} to session ${currentSessionId}`,
            );
          }
          if (targetSessionId) {
            const commandText = getMessageText(message);
            if (aliceCommands.has(commandText)) {
              await showAliceLink(targetSessionId);
              await notifyPhone({
                conversation: convoId,
                conversationKey,
                credentials,
                text: "Copied a fresh Alice&Bot link from OpenCode.",
              }).catch(() => {});
              return;
            }

            const pending = pendingPermissions.get(targetSessionId);
            const permissionReply =
              permissionReplyCommands[commandText.toLowerCase()];
            if (permissionReply && pending) {
              await callFirstAvailable([
                () =>
                  (input as any).client.permission.reply({
                    requestID: pending.requestId,
                    reply: permissionReply,
                  }),
                () =>
                  (input as any).client
                    .postSessionByIdPermissionsByPermissionId(
                      {
                        path: {
                          id: pending.sessionId,
                          permissionId: pending.requestId,
                        },
                        body: { response: permissionReply },
                      },
                    ),
              ]);
              pendingPermissions.delete(targetSessionId);
              const label = permissionReply === "reject"
                ? "denied"
                : `approved (${permissionReply})`;
              await notifyPhone({
                conversation: convoId,
                conversationKey,
                credentials,
                text: `Permission ${label}.`,
              }).catch(() => {});
              await logDebug(
                `Permission ${label} for ${pending.requestId}`,
              );
              return;
            }
            if (pending) {
              await notifyPhone({
                conversation: convoId,
                conversationKey,
                credentials,
                text:
                  `Pending permission: ${pending.description}\nReply /yes, /no, or /always`,
              }).catch(() => {});
              return;
            }

            const pendingQuestion = await pendingQuestionForSession({
              client: (input as any).client,
              sessionId: targetSessionId,
            });
            if (pendingQuestion) {
              const answers = answersFromQuestionReplyText(
                pendingQuestion,
                commandText,
              );
              if (answers) {
                await (input as any).client.question.reply({
                  requestID: pendingQuestion.id,
                  answers,
                });
                pendingQuestions.delete(targetSessionId);
                await notifyPhone({
                  conversation: convoId,
                  conversationKey,
                  credentials,
                  text: "Choice submitted.",
                }).catch(() => {});
                return;
              }
              await (input as any).client.question.reject({
                requestID: pendingQuestion.id,
              }).catch(() => {});
              pendingQuestions.delete(targetSessionId);
              await logDebug(
                `Rejected question ${pendingQuestion.id}; forwarding free text`,
              );
            }

            if (commandText === "/new") {
              try {
                const result = await callFirstAvailable([
                  () => client.session.create({}),
                  () => client.session.create({ body: {} }),
                  () => client.session.create(),
                ]);
                const newSessionId = (result as any)?.id ||
                  (result as any)?.data?.id;
                if (!newSessionId) throw new Error("No session ID returned");
                currentSessionId = newSessionId;
                await saveState();
                await notifyPhone({
                  conversation: convoId,
                  conversationKey,
                  credentials,
                  text: `New session started.\n${getLink()}`,
                });
                await logDebug(
                  `Created new session ${newSessionId} from /new command`,
                );
              } catch (err: unknown) {
                await logDebug(
                  `/new failed: ${(err as Error).message}`,
                );
                await notifyPhone({
                  conversation: convoId,
                  conversationKey,
                  credentials,
                  text: `Failed to create new session: ${
                    (err as Error).message
                  }`,
                });
              }
              return;
            }

            if (!message.attachments?.length) {
              try {
                const commandResult = await runPhoneCommand({
                  client: (input as any).client,
                  getLink,
                  sessionId: targetSessionId,
                  text: commandText,
                });
                if (commandResult?.handled) {
                  await logDebug(`Handled phone command: ${commandText}`);
                  if (commandResult.reply) {
                    await notifyPhone({
                      conversation: convoId,
                      conversationKey,
                      credentials,
                      text: commandResult.reply,
                    }).catch(() => {});
                  }
                  return;
                }
              } catch (err: unknown) {
                await logDebug(
                  `Phone command failed for '${commandText}': ${
                    (err as Error).message
                  }`,
                );
                await notifyPhone({
                  conversation: convoId,
                  conversationKey,
                  credentials,
                  text: `[System: Failed to run ${commandText}. ${
                    (err as Error).message
                  }]`,
                }).catch(() => {});
                return;
              }
            }

            const parts = await buildPromptParts(message);

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
              sessionToActiveMessageId.set(targetSessionId, messageId);
              sessionToLastMessageId.set(targetSessionId, messageId);
              await startTyping({
                conversation: convoId,
                publicSignKey: (credentials as any).publicSignKey,
                sessionId: targetSessionId,
              });
            } catch (err: any) {
              await logDebug(
                `Failed to prompt session (it may have died): ${err?.message}`,
              );
              if (promptWasAcceptedDespiteError(err)) {
                sessionToActiveMessageId.set(targetSessionId, messageId);
                sessionToLastMessageId.set(targetSessionId, messageId);
                await startTyping({
                  conversation: convoId,
                  publicSignKey: (credentials as any).publicSignKey,
                  sessionId: targetSessionId,
                });
                return;
              }
              await clearTyping({
                conversation: convoId,
                publicSignKey: (credentials as any).publicSignKey,
                sessionId: targetSessionId,
              });
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
      clearInterval(pingInterval);
      logDebug("WebSocket closed, reconnecting in 5 seconds...");
      clearTimeout((globalThis as any).__aliceReconnectTimer);
      (globalThis as any).__aliceReconnectTimer = setTimeout(() => {
        (globalThis as any).__aliceWebSocket = setupWebSocket();
      }, 5000);
    };

    ws.onerror = (err) => {
      logDebug(`WebSocket error: ${err}, closing to trigger reconnect`);
      ws.close();
    };

    return ws;
  };

  const existingWs = (globalThis as any).__aliceWebSocket;
  if (existingWs && typeof existingWs.close === "function") {
    existingWs.onclose = null;
    existingWs.close();
  }
  clearTimeout((globalThis as any).__aliceReconnectTimer);
  (globalThis as any).__aliceWebSocket = setupWebSocket();

  const client = (input as any).client;

  const showAliceLink = async (sessionId: string) => {
    currentSessionId = sessionId;
    await saveState();
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

  return {
    event: async ({ event }: any) => {
      if (
        event.type === "tui.command.execute" &&
        aliceCommands.has(event.properties?.command?.trim())
      ) {
        await showAliceLink(
          event.properties?.sessionID || currentSessionId || "",
        );
      }
      if (event.type === "permission.asked") {
        const { id, sessionID, permission, metadata } = event.properties || {};
        const description = formatPermissionDescription({
          permission,
          metadata,
        });
        pendingPermissions.set(sessionID, {
          requestId: id,
          sessionId: sessionID,
          description,
        });
        await logDebug(
          `Permission asked: ${description} (requestId=${id})`,
        );
        const convoInfo = sessionToConvoKey.get(sessionID);
        if (convoInfo) {
          await notifyPhone({
            conversation: convoInfo.conversation,
            conversationKey: convoInfo.conversationKey,
            credentials,
            text: `[Permission] ${description}\nReply /yes, /no, or /always`,
          }).catch(() => {});
        }
      }
      if (event.type === "permission.replied") {
        const { sessionID, requestID } = event.properties || {};
        const pending = pendingPermissions.get(sessionID);
        if (pending?.requestId === requestID) {
          pendingPermissions.delete(sessionID);
          await logDebug(
            `Permission cleared by TUI: requestId=${requestID}`,
          );
        }
      }
      if (event.type === "question.asked") {
        const request = event.properties;
        if (!request?.sessionID) return;
        pendingQuestions.set(request.sessionID, request);
        await logDebug(`Question asked: requestId=${request.id}`);
        const convoInfo = sessionToConvoKey.get(request.sessionID);
        if (convoInfo) {
          await notifyPhone({
            conversation: convoInfo.conversation,
            conversationKey: convoInfo.conversationKey,
            credentials,
            text: formatQuestionRequest(request),
          }).catch(() => {});
        }
      }
      if (
        event.type === "question.replied" || event.type === "question.rejected"
      ) {
        const { sessionID, requestID } = event.properties || {};
        const pending = pendingQuestions.get(sessionID);
        if (pending?.id === requestID) {
          pendingQuestions.delete(sessionID);
          await logDebug(`Question cleared: requestId=${requestID}`);
        }
      }
      if (event.type === "message.part.updated") {
        const part = event.properties?.part;
        const convoInfo = sessionToConvoKey.get(part?.sessionID);
        if (convoInfo) {
          const streamUpdate = reasoningStreamUpdate({
            conversationId: convoInfo.conversation,
            part,
            publicSignKey: (credentials as any).publicSignKey,
          });
          const reasoningKey = `${part?.id}:${part?.text}:${
            part?.time?.end ?? ""
          }`;
          if (streamUpdate && rememberOnce(sentReasoningParts, reasoningKey)) {
            await sendUiUpdate(streamUpdate).catch((e: any) =>
              logDebug(`Error sending reasoning stream: ${e?.message}`)
            );
          }
          if (part?.time?.end) {
            await clearTyping({
              conversation: convoInfo.conversation,
              publicSignKey: (credentials as any).publicSignKey,
              sessionId: part.sessionID,
            });
          }
        }
      }
    },
    "chat.message": async (hookInput: any, output: any) => {
      const textPart = output.parts?.find((part: any) => part.type === "text");
      const trimmed = textPart?.text?.trim() || "";
      if (aliceCommands.has(trimmed)) {
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
      hookInput: any,
      currentOutput: any,
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
          const key = completionKey({ hookInput, currentOutput });
          try {
            if (!rememberOnce(sentCompletionKeys, key)) {
              await logDebug(`Ignoring duplicate completion key=${key}`);
              await clearTyping({
                conversation: convoInfo.conversation,
                publicSignKey: (credentials as any).publicSignKey,
                sessionId: hookInput.sessionID,
              });
              return currentOutput;
            }
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
          await clearTyping({
            conversation: convoInfo.conversation,
            publicSignKey: (credentials as any).publicSignKey,
            sessionId: hookInput.sessionID,
          });
          markSessionMessageCompleted(hookInput.sessionID);
        } else {
          await logDebug("No phone convo linked to this session.");
        }
      }
      return currentOutput;
    },
  };
}
