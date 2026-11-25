import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import QRCode from "qrcode";
import { setWebhook } from "../backend/src/api.ts";
import {
  type Attachment,
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

const getConfigDir = () =>
  Deno.env.get("ALICEANDBOT_MCP_CONFIG_DIR") ||
  path.join(os.homedir(), ".config", "aliceandbot-mcp");
const getCredentialsPath = () => path.join(getConfigDir(), "credentials.json");
const getStatePath = () => path.join(getConfigDir(), "state.json");
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
  await Deno.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  await Deno.writeTextFile(filePath, JSON.stringify(data), { mode: 0o600 });
};

const isValidState = (value: Partial<State> | null): value is State =>
  Boolean(
    value &&
      typeof value.relayToken === "string" &&
      value.relayToken &&
      typeof value.pairingCode === "string" &&
      value.pairingCode.length >= 16,
  );

const normalizeState = (existing: State): State => ({
  relayToken: existing.relayToken,
  pairingCode: existing.pairingCode,
  ...(typeof existing.authorizedPublicSignKey === "string" &&
      existing.authorizedPublicSignKey
    ? { authorizedPublicSignKey: existing.authorizedPublicSignKey }
    : {}),
});

const getCredentials = async (): Promise<Credentials> => {
  const credentialsPath = getCredentialsPath();
  const existing = await readJson<Credentials>(credentialsPath);
  if (existing) return existing;
  const creds = await createIdentity("MCP Session");
  await writeJson(credentialsPath, creds);
  return creds;
};

const getState = async (): Promise<State> => {
  const statePath = getStatePath();
  const existing = await readJson<Partial<State>>(statePath);
  if (isValidState(existing)) return normalizeState(existing);
  const next: State = {
    relayToken: typeof existing?.relayToken === "string" && existing.relayToken
      ? existing.relayToken
      : crypto.randomUUID(),
    pairingCode: generatePairingCode(),
    ...(typeof existing?.authorizedPublicSignKey === "string" &&
        existing.authorizedPublicSignKey
      ? { authorizedPublicSignKey: existing.authorizedPublicSignKey }
      : {}),
  };
  await writeJson(statePath, next);
  return next;
};

const mcpRuntime: {
  credentials: Credentials | null;
  state: State | null;
  pollTimer: ReturnType<typeof setInterval> | null;
  pollInFlight: Promise<void> | null;
} = {
  credentials: null,
  state: null,
  pollTimer: null,
  pollInFlight: null,
};

const conversations = new Map<string, ConvState>();
const inbox: DecodedMessage[] = [];

const textResult = (text: string) => ({
  content: [{ type: "text" as const, text }],
});

const errorResult = (text: string) => ({
  content: [{ type: "text" as const, text }],
  isError: true as const,
});

const isPollResponse = (
  value: unknown,
): value is { messages: WebhookUpdate[] } =>
  Boolean(
    value &&
      typeof value === "object" &&
      "messages" in value &&
      Array.isArray(value.messages),
  );

const formatAttachment =
  (conversationKey: string) => async (att: Attachment): Promise<string> => {
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
      await Deno.writeFile(filename, new Uint8Array(data), { mode: 0o600 });
      return `[Attachment saved to ${filename}]`;
    } catch (e) {
      return `[Failed to download attachment: ${e}]`;
    }
  };

const processWebhookMessage =
  (state: State, credentials: Credentials) =>
  async (msg: WebhookUpdate): Promise<DecodedMessage | null> => {
    const result = await handleWebhookUpdate(msg, credentials, {
      requireServerSignature: true,
    });
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
      state.authorizedPublicSignKey = authDecision.authorizedPublicSignKey;
      await writeJson(getStatePath(), state);
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
    if (message.type !== "text" && message.type !== "edit") return null;

    const attachmentLines = "attachments" in message && message.attachments
      ? await Promise.all(
        message.attachments.map(formatAttachment(conversationKey)),
      )
      : [];

    const fullText = [message.text, ...attachmentLines]
      .filter(Boolean)
      .join("\n");
    if (!fullText) return null;

    return {
      conversationId,
      text: fullText,
      type: message.type,
    };
  };

const runPollRelay = async () => {
  const { state, credentials } = mcpRuntime;
  if (!state || !credentials) return;
  try {
    const res = await fetch(`${relayUrl}/poll/${state.relayToken}`);
    if (!res.ok) return;
    const body: unknown = await res.json();
    if (!isPollResponse(body) || !body.messages.length) return;
    const decoded = (
      await Promise.all(
        body.messages.map(processWebhookMessage(state, credentials)),
      )
    ).filter((m): m is DecodedMessage => m !== null);
    if (decoded.length) {
      inbox.push(...decoded);
      server.sendToolListChanged().catch(() => {});
    }
  } catch {
    // relay poll failed; will retry next interval
  }
};

const pollRelay = (): Promise<void> => {
  if (mcpRuntime.pollInFlight) return mcpRuntime.pollInFlight;
  const pending = runPollRelay().finally(() => {
    mcpRuntime.pollInFlight = null;
  });
  mcpRuntime.pollInFlight = pending;
  return pending;
};

const startPolling = () => {
  if (mcpRuntime.pollTimer) return;
  mcpRuntime.pollTimer = setInterval(() => {
    pollRelay();
  }, POLL_INTERVAL_MS);
};

const restoreExistingRuntime = async (): Promise<boolean> => {
  if (mcpRuntime.credentials && mcpRuntime.state) return true;
  const [credentials, rawState] = await Promise.all([
    readJson<Credentials>(getCredentialsPath()),
    readJson<Partial<State>>(getStatePath()),
  ]);
  if (!credentials || !isValidState(rawState)) return false;
  mcpRuntime.credentials = credentials;
  mcpRuntime.state = normalizeState(rawState);
  startPolling();
  return true;
};

const setup = async () => {
  const credentials = await getCredentials();
  const state = await getState();
  mcpRuntime.credentials = credentials;
  mcpRuntime.state = state;
  const webhookRes = await setWebhook({
    url: `${relayUrl}/webhook/${state.relayToken}`,
    credentials,
  });
  if (!webhookRes.success) {
    return errorResult(`Failed to register webhook: ${webhookRes.error}`);
  }
  startPolling();
  const dirName = path.basename(process.cwd()) || "session";
  const topic = `MCP_${dirName}_${Date.now()}`;
  const link = await chatWithMeLink(credentials.publicSignKey, topic);
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
      "You'll be notified automatically when messages arrive, or call aliceandbot_read to check anytime.",
    ].join("\n"),
  );
};

const readInbox = async () => {
  if (!mcpRuntime.credentials && !(await restoreExistingRuntime())) {
    return errorResult("Run aliceandbot_setup first.");
  }
  await pollRelay();
  if (!inbox.length) return textResult("No new messages.");
  const text = inbox
    .map((m) => `Conversation: ${m.conversationId}\nMessage: ${m.text}`)
    .join("\n\n");
  inbox.length = 0;
  server.sendToolListChanged().catch(() => {});
  return textResult(text);
};

const reply = async (conversation: string, text: string) => {
  if (!conversation.trim() || !text.trim()) {
    return errorResult("Both conversation and text are required.");
  }
  if (!mcpRuntime.credentials && !(await restoreExistingRuntime())) {
    return errorResult("Run aliceandbot_setup first.");
  }
  const { credentials } = mcpRuntime;
  if (!credentials) return errorResult("Run aliceandbot_setup first.");
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
  { capabilities: { tools: { listChanged: true }, prompts: {} } },
);

server.onclose = () => {
  if (mcpRuntime.pollTimer) {
    clearInterval(mcpRuntime.pollTimer);
    mcpRuntime.pollTimer = null;
  }
};

server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: [
    {
      name: "aliceandbot_setup",
      description:
        "Set up Alice&Bot messaging. Returns a QR code and link to chat with this session from your phone.",
      inputSchema: { type: "object" as const, properties: {} },
    },
    {
      name: "aliceandbot_read",
      description: inbox.length
        ? `[${inbox.length}] new message${
          inbox.length > 1 ? "s" : ""
        } waiting. Call this tool to read them.`
        : "Check for and read incoming Alice&Bot messages.",
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
  ],
}));

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
  return errorResult(`Unknown tool: ${name}`);
});

server.setRequestHandler(ListPromptsRequestSchema, () => ({
  prompts: [
    {
      name: "aliceandbot",
      description: "Chat with this session via Alice&Bot",
    },
  ],
}));

server.setRequestHandler(GetPromptRequestSchema, (request) => {
  if (request.params.name !== "aliceandbot") {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Unknown prompt: ${request.params.name}`,
    );
  }
  return {
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: [
            "Set up Alice&Bot so I can message this session from my phone.",
            "Call aliceandbot_setup to get a QR code and pairing code.",
            "Read incoming messages with aliceandbot_read and respond with aliceandbot_reply.",
          ].join(" "),
        },
      },
    ],
  };
});

if (import.meta.main) {
  await restoreExistingRuntime();
  await server.connect(new StdioServerTransport());
}
