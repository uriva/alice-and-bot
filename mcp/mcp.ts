import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import QRCode from "qrcode";
import {
  chatWithMeLink,
  createIdentity,
  type Credentials,
  handleWebhookUpdate,
  sendMessage,
  sendMessageWithKey,
  type WebhookUpdate,
} from "../protocol/src/clientApi.ts";
import { setWebhook } from "../backend/src/api.ts";

const configDir = `${Deno.env.get("HOME")}/.config/aliceandbot-mcp`;
const credentialsPath = `${configDir}/credentials.json`;
const statePath = `${configDir}/state.json`;
const relayUrl = Deno.env.get("ALICEANDBOT_RELAY_URL") ||
  "https://api.aliceandbot.com/relay";
const POLL_INTERVAL_MS = 3_000;

type State = { relayToken: string };
type ConvState = { conversationKey: string };

type DecodedMessage = {
  conversationId: string;
  text: string;
  type: string;
};

const readJson = async <T>(path: string): Promise<T | null> => {
  try {
    return JSON.parse(await Deno.readTextFile(path));
  } catch {
    return null;
  }
};

const writeJson = async <T>(path: string, data: T) => {
  await Deno.mkdir(configDir, { recursive: true });
  await Deno.writeTextFile(path, JSON.stringify(data));
};

const getCredentials = async (): Promise<Credentials> => {
  const existing = await readJson<Credentials>(credentialsPath);
  if (existing) return existing;
  const creds = await createIdentity("MCP Session");
  await writeJson(credentialsPath, creds);
  return creds;
};

const getState = async (): Promise<State> => {
  const existing = await readJson<State>(statePath);
  if (existing) return existing;
  const s: State = { relayToken: crypto.randomUUID() };
  await writeJson(statePath, s);
  return s;
};

let credentials: Credentials | null = null;
let state: State | null = null;
const conversations = new Map<string, ConvState>();
const inbox: DecodedMessage[] = [];
let pollTimer: ReturnType<typeof setInterval> | null = null;

const textResult = (text: string) => ({
  content: [{ type: "text" as const, text }],
});

const pollRelay = async () => {
  if (!state || !credentials) return;
  try {
    const res = await fetch(`${relayUrl}/poll/${state.relayToken}`);
    const { messages } = (await res.json()) as { messages: WebhookUpdate[] };
    if (!messages.length) return;
    const decoded = (
      await Promise.all(
        messages.map(async (msg) => {
          const result = await handleWebhookUpdate(msg, credentials!);
          if (!result) return null;
          const { conversationId, message, conversationKey } = result;
          conversations.set(conversationId, { conversationKey });
          return {
            conversationId,
            text: message.text,
            type: message.type,
          };
        }),
      )
    ).filter((m) => m !== null);
    if (decoded.length) {
      inbox.push(...decoded);
      server.sendToolListChanged().catch(() => {});
    }
  } catch {
    // relay poll failed; will retry next interval
  }
};

const startPolling = () => {
  if (pollTimer) return;
  pollTimer = setInterval(pollRelay, POLL_INTERVAL_MS);
};

const setup = async () => {
  credentials = await getCredentials();
  state = await getState();
  await setWebhook({
    url: `${relayUrl}/webhook/${state.relayToken}`,
    credentials,
  });
  startPolling();
  const link = chatWithMeLink(credentials.publicSignKey);
  const qr = await QRCode.toString(link, { type: "utf8" });
  return textResult(
    [
      qr,
      `Chat with this session: ${link}`,
      "",
      "Scan the QR code or open the link in Alice&Bot.",
      "You'll be notified automatically when messages arrive.",
    ].join("\n"),
  );
};

const readInbox = () => {
  if (!credentials) return textResult("Run aliceandbot_setup first.");
  if (!inbox.length) return textResult("No new messages.");
  const text = inbox
    .map((m) => `Conversation: ${m.conversationId}\nMessage: ${m.text}`)
    .join("\n\n");
  inbox.length = 0;
  server.sendToolListChanged().catch(() => {});
  return textResult(text);
};

const reply = async (conversation: string, text: string) => {
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

const server = new Server(
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
      description: `📬 ${inbox.length} new message${
        inbox.length > 1 ? "s" : ""
      } waiting. Call this tool to read them.`,
      inputSchema: { type: "object" as const, properties: {} },
    });
  }
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, (request) => {
  const { name } = request.params;
  const args = (request.params.arguments ?? {}) as Record<string, string>;
  if (name === "aliceandbot_setup") return setup();
  if (name === "aliceandbot_read") return readInbox();
  if (name === "aliceandbot_reply") return reply(args.conversation, args.text);
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

await server.connect(new StdioServerTransport());
