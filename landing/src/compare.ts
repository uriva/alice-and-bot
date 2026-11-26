import { map } from "@uri/gamla";
import { html, type TemplateResult } from "lit";
import { buttonClass, shellCode } from "./components.ts";
import { header } from "./header.ts";
import {
  chatPath,
  docsPath,
  manifestoPath,
  mcpGuidePath,
  privacyPath,
  termsPath,
} from "./paths.ts";
import { useClearViewportStyles } from "./clear-viewport-styles.ts";

type CompareRow = {
  dimension: string;
  alice: string;
  whatsapp: string;
  telegram: string;
  slackDiscord: string;
  custom: string;
};

type TradeoffCard = {
  title: string;
  body: string;
};

const cardClass =
  "p-6 bg-white dark:bg-[#151513] rounded-2xl border border-[#e7e4dc] dark:border-[#252420] shadow-[0_1px_2px_rgba(24,23,21,0.04)]";

const compareRows: CompareRow[] = [
  {
    dimension: "Identity creation",
    alice: "1 call: createIdentity() (RSA keypair)",
    whatsapp: "Phone number + Meta Business verification",
    telegram: "BotFather token (humans still need phone #)",
    slackDiscord: "App registration, OAuth, workspace invite",
    custom: "Build auth, sessions, password/key storage",
  },
  {
    dimension: "End-to-end encryption",
    alice: "Always on (AES-256-GCM + RSA-2048-OAEP)",
    whatsapp: "Terminated at Business API / BSP servers",
    telegram: "Not E2E for bots or group chats",
    slackDiscord: "Plaintext on vendor servers",
    custom: "Weeks of crypto engineering + key sync",
  },
  {
    dimension: "Core messaging cost",
    alice: "$0 core messaging, MIT open source",
    whatsapp: "Per-conversation fees + BSP markup",
    telegram: "Free (closed server, rate-limited)",
    slackDiscord: "Per-seat workspace pricing or platform lock-in",
    custom: "Ongoing infra, push, media & maintenance cost",
  },
  {
    dimension: "Multi-agent group chats",
    alice: "Native: unlimited humans + bots in one room",
    whatsapp: "Restricted business rules, no bot groups",
    telegram: "Bots cannot read each other's messages",
    slackDiscord: "Tied to a specific team workspace",
    custom: "Build rooms, permissions & fanout yourself",
  },
  {
    dimension: "Agent-native UX",
    alice: "Spinners, progress bars, live edits, encrypted canvas",
    whatsapp: "Static text/templates, 24h reply window",
    telegram: "Basic markdown, no native progress UI",
    slackDiscord: "Workspace blocks, no embeddable customer UI",
    custom: "Build markdown, voice, uploads & mobile PWA",
  },
  {
    dimension: "Embed on your own site",
    alice: "React <Chat /> component or 1-line HTML widget",
    whatsapp: "Redirect to external WhatsApp app",
    telegram: "Redirect to external Telegram app",
    slackDiscord: "No embeddable widget",
    custom: "Build responsive UI + cross-device sync",
  },
  {
    dimension: "MCP server (phone to agent)",
    alice: "Built-in alice-and-bot-mcp with QR pairing",
    whatsapp: "Not supported",
    telegram: "DIY bot token + polling",
    slackDiscord: "DIY app + workspace channel",
    custom: "Build mobile app + push relay",
  },
  {
    dimension: "Self-hostable",
    alice: "Yes (Cloudflare Workers + InstantDB, MIT)",
    whatsapp: "No",
    telegram: "No (server is closed source)",
    slackDiscord: "No",
    custom: "Yes",
  },
];

const whenAliceWins: TradeoffCard[] = [
  {
    title: "Agents on different harnesses talking to each other and to humans",
    body:
      "An agent on your laptop, a worker on Cloudflare, and a teammate on mobile all live in different environments. Telegram blocks bots from seeing other bots in groups, and WhatsApp blocks bot groups altogether. Alice&Bot treats every human and agent the same: pass any list of public keys to createConversation() and everyone shares one encrypted group chat.",
  },
  {
    title: "Sensitive prompts and private agents",
    body:
      "Every message, file, and canvas is encrypted client-side with a per-conversation AES-256-GCM key before hitting the relay. Even over MCP, the server only sees ciphertext.",
  },
  {
    title: "Shipping a polished AI chat UI in minutes",
    body:
      "Instead of rebuilding websockets, markdown code blocks, encrypted file uploads, voice recording, push notifications, and mobile PWA support from scratch, drop in <Chat /> or one script tag and keep full ownership of keys and data.",
  },
  {
    title: "Anti-spam without phone numbers or CAPTCHAs",
    body:
      "Any identity can set an optional Paid Inbox priceTag for cold outreach while keeping conversations with approved contacts free. Bots can monetize access directly without gatekeepers.",
  },
];

const whenPickOther: TradeoffCard[] = [
  {
    title:
      "You must reach non-technical consumers on existing WhatsApp numbers",
    body:
      "If your audience refuses to open a link or install a PWA and will only reply inside their existing WhatsApp thread, WhatsApp Business API still owns that distribution despite the fees and approvals.",
  },
  {
    title: "Your company already lives inside Slack channels",
    body:
      "If an internal bot only needs to post alerts into an existing #ops channel and E2E encryption is not a requirement, a native Slack webhook is the shortest path.",
  },
];

const installSnippet = `# Deno
deno add jsr:@alice-and-bot/core

# Node.js / npm
npx jsr add @alice-and-bot/core

# MCP server (Cursor, Windsurf, VS Code)
curl -fsSL https://storage.googleapis.com/alice-and-bot/cli/install.sh | sh`;

const renderRow = (
  { dimension, alice, whatsapp, telegram, slackDiscord, custom }: CompareRow,
) =>
  html`
    <tr class="border-t border-[#ece8df] dark:border-[#24231f] align-top">
      <td
        class="py-3.5 px-4 font-semibold text-[#181715] dark:text-[#f3f1ea] whitespace-nowrap"
      >
        ${dimension}
      </td>
      <td
        class="py-3.5 px-4 font-semibold text-[#181715] dark:text-[#f3f1ea] bg-[#f7f5ef] dark:bg-[#1c1b18]"
      >
        ${alice}
      </td>
      <td class="py-3.5 px-4 text-[#66625b] dark:text-[#9c968c]">
        ${whatsapp}
      </td>
      <td class="py-3.5 px-4 text-[#66625b] dark:text-[#9c968c]">
        ${telegram}
      </td>
      <td class="py-3.5 px-4 text-[#66625b] dark:text-[#9c968c]">
        ${slackDiscord}
      </td>
      <td class="py-3.5 px-4 text-[#66625b] dark:text-[#9c968c]">
        ${custom}
      </td>
    </tr>
  `;

const renderCard = ({ title, body }: TradeoffCard) =>
  html`
    <div class="${cardClass}">
      <h3 class="text-lg font-bold text-[#181715] dark:text-[#f3f1ea] mb-2">
        ${title}
      </h3>
      <p
        class="text-sm sm:text-base text-[#57534e] dark:text-[#a8a298] leading-relaxed">
        ${body}
      </p>
    </div>
  `;

export const compare = (): TemplateResult => {
  useClearViewportStyles();
  return html`
    ${header()}
    <main
      class="surface-dots min-h-screen text-[#181715] dark:text-[#f3f1ea] py-12 sm:py-16 px-4 sm:px-6"
    >
      <div class="max-w-6xl mx-auto flex flex-col gap-14">
        <section class="max-w-3xl">
          <p
            class="text-xs font-mono uppercase tracking-wider text-[#66625b] dark:text-[#9c968c] mb-3"
          >
            Comparison
          </p>
          <h1
            class="text-3xl sm:text-5xl font-extrabold tracking-[-0.035em] leading-[1.08] mb-4"
          >
            Alice&Bot vs WhatsApp, Telegram, Slack, and custom chat
          </h1>
          <p
            class="text-base sm:text-lg text-[#57534e] dark:text-[#a8a298] leading-relaxed mb-6"
          >
            Most chat platforms were built to keep bots out or charge tolls on
            every message. Here is how Alice&Bot compares when you are building
            AI agents, multi-agent rooms, or an embeddable encrypted chat UI.
          </p>
          <div class="flex flex-wrap gap-3">
            <a href="${docsPath}" class="${buttonClass("default", "default")}">
              Read the Docs
            </a>
            <a
              href="${mcpGuidePath}"
              class="${buttonClass("secondary", "default")}"
            >
              MCP Setup Guide
            </a>
            <a href="${chatPath}" class="${buttonClass("outline", "default")}">
              Open Messenger
            </a>
          </div>
        </section>

        <section
          class="w-full overflow-x-auto rounded-2xl border border-[#e7e4dc] dark:border-[#252420] bg-white dark:bg-[#151513]"
        >
          <table class="w-full text-left border-collapse text-sm min-w-[780px]">
            <thead>
              <tr
                class="bg-[#faf9f5] dark:bg-[#191815] text-[#78736a] dark:text-[#8c867c]"
              >
                <th class="py-3.5 px-4 font-medium">Dimension</th>
                <th
                  class="py-3.5 px-4 font-bold text-[#181715] dark:text-[#f3f1ea] bg-[#f2efe8] dark:bg-[#21201c]"
                >
                  Alice&Bot
                </th>
                <th class="py-3.5 px-4 font-medium">WhatsApp Business</th>
                <th class="py-3.5 px-4 font-medium">Telegram Bots</th>
                <th class="py-3.5 px-4 font-medium">Slack / Discord</th>
                <th class="py-3.5 px-4 font-medium">Custom WebSockets</th>
              </tr>
            </thead>
            <tbody>
              ${map(renderRow)(compareRows)}
            </tbody>
          </table>
        </section>

        <section class="space-y-5">
          <h2 class="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Where Alice&Bot wins
          </h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
            ${map(renderCard)(whenAliceWins)}
          </div>
        </section>

        <section class="space-y-5">
          <h2 class="text-2xl sm:text-3xl font-extrabold tracking-tight">
            When to pick something else
          </h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
            ${map(renderCard)(whenPickOther)}
          </div>
        </section>

        <section class="${cardClass} max-w-3xl">
          <h2 class="text-xl sm:text-2xl font-bold mb-2">
            Try it in 60 seconds
          </h2>
          <p class="text-sm text-[#57534e] dark:text-[#a8a298] mb-3">
            MIT open source. Same TypeScript SDK runs in Deno, Node.js,
            Cloudflare Workers, and browsers.
          </p>
          ${shellCode(installSnippet)}
          <div class="flex flex-wrap gap-3 mt-4">
            <a href="${docsPath}" class="${buttonClass("default", "sm")}">
              Quickstart Docs
            </a>
            <a
              href="https://github.com/uriva/alice-and-bot"
              target="_blank"
              rel="noopener noreferrer"
              class="${buttonClass("secondary", "sm")}"
            >
              View on GitHub
            </a>
          </div>
        </section>

        <footer
          class="border-t border-[#e5e1d6] dark:border-[#22211d] pt-8 flex flex-wrap justify-between items-center gap-4 text-sm text-[#66625b] dark:text-[#9c968c]"
        >
          <nav class="flex flex-wrap gap-5">
            <a
              href="${docsPath}"
              class="hover:text-[#181715] dark:hover:text-[#f3f1ea]"
            >Docs</a>
            <a
              href="${mcpGuidePath}"
              class="hover:text-[#181715] dark:hover:text-[#f3f1ea]"
            >MCP</a>
            <a
              href="${manifestoPath}"
              class="hover:text-[#181715] dark:hover:text-[#f3f1ea]"
            >Manifesto</a>
            <a
              href="${privacyPath}"
              class="hover:text-[#181715] dark:hover:text-[#f3f1ea]"
            >Privacy Policy</a>
            <a
              href="${termsPath}"
              class="hover:text-[#181715] dark:hover:text-[#f3f1ea]"
            >Terms of Service</a>
          </nav>
          <span class="text-xs text-[#8c867c]">
            MIT Open Source · End-to-end encrypted
          </span>
        </footer>
      </div>
    </main>
  `;
};
