import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import QRCode from "qrcode";
import { setWebhook } from "../backend/src/api.ts";
import {
  chatWithMeLink,
  createIdentity,
  type Credentials,
  downloadAttachment,
  handleWebhookUpdate,
  sendMessage,
  sendMessageWithKey,
  type WebhookUpdate,
} from "../protocol/src/clientApi.ts";
import {
  evaluateSenderAuthorization,
  generatePairingCode,
  isAllowedAttachmentUrl,
  sanitizeTempExtension,
} from "./security.ts";

const configDir = `${Deno.env.get("HOME")}/.config/aliceandbot-mcp`;
const credentialsPath = `${configDir}/credentials.json`;
const statePath = `${configDir}/state.json`;
const relayUrl = Deno.env.get("ALICEANDBOT_RELAY_URL") ||
  "https://api.aliceandbot.com/relay";
const POLL_INTERVAL_MS = 3_000;

type State = {
  relayToken: string;
  pairingCode: string;
  authorizedPublicSignKey?: string;
};
type ConvState = { conversationKey: string };

type DecodedMessage = {
  conversationId: string;
  text: string;
  type: string;
};

const readJson = async <T>(filePath: string): Promise<T | null> => {
  try {
    return JSON.parse(await Deno.readTextFile(filePath));
  } catch {
    return null;
  }
};

const writeJson = async <T>(filePath: string, data: T) => {
  await Deno.mkdir(configDir, { recursive: true, mode: 0o700 });
  await Deno.writeTextFile(filePath, JSON.stringify(data), { mode: 0o600 });
};

const getCredentials = async (): Promise<Credentials> => {
  const existing = await readJson<Credentials>(credentialsPath);
  if (existing) return existing;
  const creds = await createIdentity("MCP Session");
  await writeJson(credentialsPath, creds);
  return creds;
};

const getState = async (): Promise<State> => {
  const existing = await readJson<Partial<State>>(statePath);
  if (
    existing &&
    typeof existing.relayToken === "string" &&
    existing.relayToken &&
    typeof existing.pairingCode === "string" &&
    existing.pairingCode.length >= 16
  ) {
    return {
      relayToken: existing.relayToken,
      pairingCode: existing.pairingCode,
      ...(typeof existing.authorizedPublicSignKey === "string" &&
          existing.authorizedPublicSignKey
        ? { authorizedPublicSignKey: existing.authorizedPublicSignKey }
        : {}),
    };
  }
  const s: State = {
    relayToken: typeof existing?.relayToken === "string" && existing.relayToken
      ? existing.relayToken
      : crypto.randomUUID(),
    pairingCode: generatePairingCode(),
    ...(typeof existing?.authorizedPublicSignKey === "string" &&
        existing.authorizedPublicSignKey
      ? { authorizedPublicSignKey: existing.authorizedPublicSignKey }
      : {}),
  };
  await writeJson(statePath, s);
  return s;
};

const mcpRuntime: {
  credentials: Credentials | null;
  state: State | null;
  pollTimer: ReturnType<typeof setInterval> | null;
} = {
  credentials: null,
  state: null,
  pollTimer: null,
};

const conversations = new Map<string, ConvState>();
const inbox: DecodedMessage[] = [];

const textResult = (text: string) => ({
  content: [{ type: "text" as const, text }],
});

const pollRelay = async () => {
  const { state, credentials } = mcpRuntime;
  if (!state || !credentials) return;
  try {
    const res = await fetch(`${relayUrl}/poll/${state.relayToken}`);
    const { messages } = (await res.json()) as { messages: WebhookUpdate[] };
    if (!messages.length) return;
    const decoded = (
      await Promise.all(
        messages.map(async (msg) => {
          const result = await handleWebhookUpdate(msg, credentials);
          if (!result) return null;
          const { conversationId, message, conversationKey } = result;

          const authDecision = evaluateSenderAuthorization({
            senderPublicSignKey: message.publicSignKey,
            botPublicSignKey: credentials.publicSignKey,
            messageText: message.text ?? "",
            pairingCode: state.pairingCode,
            authorizedPublicSignKey: state.authorizedPublicSignKey,
          });
          if (authDecision.status === "ignore-self") return null;
          if (authDecision.status === "rejected") return null;
          if (authDecision.status === "paired-now") {
            state.authorizedPublicSignKey =
              authDecision.authorizedPublicSignKey;
            await writeJson(statePath, state);
            conversations.set(conversationId, { conversationKey });
            await sendMessageWithKey({
              conversationKey,
              conversation: conversationId,
              credentials,
              message: {
                type: "text",
                text: "Device paired with this MCP session.",
              },
            }).catch(() => {});
            return null;
          }

          conversations.set(conversationId, { conversationKey });
          const attachmentLines =
            "attachments" in message && message.attachments
              ? await Promise.all(
                message.attachments.map(async (att) => {
                  if (att.type === "location") {
                    return `[Location attachment: ${att.latitude}, ${att.longitude}${
                      att.label ? ` (${att.label})` : ""
                    }]`;
                  }
                  if (!isAllowedAttachmentUrl(att.url)) {
                    return "[Blocked attachment from untrusted URL]";
                  }
                  try {
                    const data = await downloadAttachment({
                      url: att.url,
                      conversationKey,
                    });
                    const rawExt = "mimeType" in att
                      ? (att.mimeType.match(/\/([^;]+)/)?.[1] ?? "bin")
                      : "bin";
                    const ext = sanitizeTempExtension(rawExt, ".bin");
                    const filename = path.join(
                      os.tmpdir(),
                      `alice_attachment_${Date.now()}_${
                        crypto.randomUUID().slice(0, 8)
                      }${ext}`,
                    );
                    await Deno.writeFile(filename, new Uint8Array(data), {
                      mode: 0o600,
                    });
                    return `[Attachment saved to ${filename}]`;
                  } catch (e) {
                    return `[Failed to download attachment: ${e}]`;
                  }
                }),
              )
              : [];

          const fullText = [message.text, ...attachmentLines]
            .filter(Boolean)
            .join("\n");

          return {
            conversationId,
            text: fullText,
            type: message.type,
          };
        }),
      )
    ).filter((m): m is NonNullable<typeof m> => m !== null);
    if (decoded.length) {
      inbox.push(...decoded);
      server.sendToolListChanged().catch(() => {});
    }
  } catch {
    // relay poll failed; will retry next interval
  }
};

const startPolling = () => {
  if (mcpRuntime.pollTimer) return;
  mcpRuntime.pollTimer = setInterval(pollRelay, POLL_INTERVAL_MS);
};

const setup = async () => {
  const credentials = await getCredentials();
  const state = await getState();
  mcpRuntime.credentials = credentials;
  mcpRuntime.state = state;
  await setWebhook({
    url: `${relayUrl}/webhook/${state.relayToken}`,
    credentials,
  });
  startPolling();
  const baseLink = await chatWithMeLink(credentials.publicSignKey);
  const dirName = process.cwd().split("/").pop() || "dir";
  const topic = `OpenCode_${dirName}_${Date.now()}`;
  const link = `${baseLink}&topic=${encodeURIComponent(topic)}`;
  const qr = await QRCode.toString(link, { type: "utf8" });
  return textResult(
    [
      qr,
      `Chat with this session: ${link}`,
      ...(state.authorizedPublicSignKey ? ["Device status: Paired"] : [
        `Pairing code: ${state.pairingCode}`,
        `Send "${state.pairingCode}" (or "/pair ${state.pairingCode}") as your first message in Alice&Bot to pair your device.`,
      ]),
      "",
      "Scan the QR code or open the link in Alice&Bot.",
      "You'll be notified automatically when messages arrive.",
    ].join("\n"),
  );
};

const readInbox = () => {
  if (!mcpRuntime.credentials) {
    return textResult("Run aliceandbot_setup first.");
  }
  if (!inbox.length) return textResult("No new messages.");
  const text = inbox
    .map((m) => `Conversation: ${m.conversationId}\nMessage: ${m.text}`)
    .join("\n\n");
  inbox.length = 0;
  server.sendToolListChanged().catch(() => {});
  return textResult(text);
};

const reply = async (conversation: string, text: string) => {
  const { credentials } = mcpRuntime;
  if (!credentials) return textResult("Run aliceandbot_setup first.");
  const conv = conversations.get(conversation);
  if (conv?.conversationKey) {
    await sendMessageWithKey({
      conversationKey: conv.conversationKey,
      conversation,
      credentials,
      message: { type: "text", text },
    });
  } else {
    await sendMessage({
      credentials,
      conversation,
      message: { type: "text", text },
    });
  }
  return textResult("Sent.");
};

export const server = new Server(
  { name: "aliceandbot", version: "0.2.0" },
  { capabilities: { tools: {}, prompts: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, () => {
  const tools = [
    {
      name: "aliceandbot_setup",
      description:
        "Set up Alice&Bot messaging. Returns a QR code and link to chat with this coding session from your phone.",
      inputSchema: { type: "object" as const, properties: {} },
    },
    {
      name: "aliceandbot_reply",
      description: "Send a reply via Alice&Bot.",
      inputSchema: {
        type: "object" as const,
        properties: {
          conversation: {
            type: "string",
            description: "Conversation ID to reply to",
          },
          text: { type: "string", description: "Message text" },
        },
        required: ["conversation", "text"],
      },
    },
  ];
  if (inbox.length) {
    tools.push({
      name: "aliceandbot_read",
      description: `[${inbox.length}] new message${
        inbox.length > 1 ? "s" : ""
      } waiting. Call this tool to read them.`,
      inputSchema: { type: "object" as const, properties: {} },
    });
  }
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, (request) => {
  const { name } = request.params;
  const rawArgs = request.params.arguments ?? {};
  const conversation = typeof rawArgs.conversation === "string"
    ? rawArgs.conversation
    : "";
  const text = typeof rawArgs.text === "string" ? rawArgs.text : "";
  if (name === "aliceandbot_setup") return setup();
  if (name === "aliceandbot_read") return readInbox();
  if (name === "aliceandbot_reply") return reply(conversation, text);
  return textResult(`Unknown tool: ${name}`);
});

server.setRequestHandler(ListPromptsRequestSchema, () => ({
  prompts: [
    {
      name: "aliceandbot",
      description: "Chat with this session via Alice&Bot",
    },
  ],
}));

server.setRequestHandler(GetPromptRequestSchema, () => ({
  messages: [
    {
      role: "user" as const,
      content: {
        type: "text" as const,
        text: [
          "Set up Alice&Bot so I can message this coding session from my phone.",
          "Call aliceandbot_setup to get a QR code.",
          "Messages will appear automatically — read them with aliceandbot_read and respond with aliceandbot_reply.",
        ].join(" "),
      },
    },
  ],
}));

if (import.meta.main) {
  await server.connect(new StdioServerTransport());
}
