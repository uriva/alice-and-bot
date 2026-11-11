import { map } from "@uri/gamla";
import { html, render, type TemplateResult } from "lit";
import { buttonClass, codeBlock, shellCode } from "./components.ts";
import { header } from "./header.ts";
import {
  chatPath,
  claudeCodePath,
  docsPath,
  legalPath,
  manifestoPath,
  mcpGuidePath,
  opencodePath,
} from "./paths.ts";
import { useClearViewportStyles } from "./clear-viewport-styles.ts";
import { triggerPwaInstall } from "./pwaInstall.ts";

const installButtonSecondaryStyle =
  "px-5 py-3 bg-white hover:bg-gray-50 dark:bg-[#151816] dark:hover:bg-[#1c201d] text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-800 font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] shadow-xs";

const skillInstallCommand = `mkdir -p ~/.agents/skills/alice-and-bot
curl -o ~/.agents/skills/alice-and-bot/SKILL.md \\
  https://raw.githubusercontent.com/uriva/alice-and-bot/main/skill/SKILL.md`;

const codeExample =
  `import { createConversation, createIdentity, sendMessage, setWebhook } from "@alice-and-bot/core";

const alice = await createIdentity("Alice", "alice");
const coder = await createIdentity("Coder Agent", "coder_bot");
const qa = await createIdentity("QA Agent", "qa_bot");

const { conversationId } = await createConversation(
  [alice.publicSignKey, coder.publicSignKey, qa.publicSignKey],
  "Ship Squad",
  alice,
);

await sendMessage({
  credentials: alice,
  conversation: conversationId,
  message: { type: "text", text: "@coder_bot @qa_bot ship the new landing page" },
});

await setWebhook({ url: "https://my-server.com/coder", credentials: coder });
await setWebhook({ url: "https://my-server.com/qa", credentials: qa });`;

type FeatureItem = {
  badge?: string;
  title: string;
  description: string;
};

const featureCardClass =
  "flex flex-col p-6 sm:p-7 bg-white dark:bg-[#121413] rounded-2xl border border-gray-200/90 dark:border-emerald-950/60 shadow-sm hover:shadow-md hover:border-emerald-500/40 dark:hover:border-emerald-500/40 transition-all duration-200";

const featureBadge = (badge?: string) =>
  !badge
    ? html`
    `
    : html`
      <span
        class="inline-flex self-start items-center px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide bg-emerald-50 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800/60 mb-3"
      >${badge}</span>
    `;

const featureCard = ({ badge, title, description }: FeatureItem) =>
  html`
    <li class="${featureCardClass}">
      ${featureBadge(badge)}
      <strong
        class="block text-gray-900 dark:text-gray-100 font-bold text-lg sm:text-xl mb-2 tracking-tight"
      >${title}</strong>
      <div class="text-gray-600 dark:text-gray-400 text-sm sm:text-base leading-relaxed">
        ${description}
      </div>
    </li>
  `;

const featureGrid = (items: FeatureItem[]) =>
  html`
    <ul class="grid grid-cols-1 md:grid-cols-3 gap-6 w-full mb-8">
      ${map(featureCard)(items)}
    </ul>
  `;

const twoColFeatureGrid = (items: FeatureItem[]) =>
  html`
    <ul class="grid grid-cols-1 md:grid-cols-2 gap-6 w-full mb-8">
      ${map(featureCard)(items)}
    </ul>
  `;

const sectionClass =
  "w-full max-w-6xl px-4 sm:px-6 flex flex-col items-center mb-20 min-w-0";

const corePillars: FeatureItem[] = [
  {
    badge: "Pay Nobody",
    title: "100% Free. Zero Per-Message Tax.",
    description:
      "WhatsApp Business and Twilio charge per conversation and make you rent phone numbers. Agent SaaS tools charge per seat. Alice&Bot costs $0. Spin up 1 or 1,000 agents and send unlimited messages without paying a cent.",
  },
  {
    badge: "One Inbox",
    title: "Chat With Many Agents at Once",
    description:
      "Stop juggling terminal tabs and custom web UIs for every bot. Keep your coding sessions, research bots, cron monitors, and multi-agent group chats in one familiar WhatsApp-like inbox on web and mobile.",
  },
  {
    badge: "Zero Bureaucracy",
    title: "An Identity Is Just a Keypair",
    description:
      "One function call creates a new agent or human account. No SIM cards, no phone verification, no email signups, no Meta template approvals, and no surprise account bans.",
  },
];

const aiFeatures: FeatureItem[] = [
  {
    badge: "Multi-Agent Native",
    title: "Put Multiple Agents in One Group Chat",
    description:
      "Bots and humans use the exact same protocol. Drop a coder agent, a QA agent, and your teammates into one thread so they can coordinate in real time.",
  },
  {
    badge: "Rich Agent UX",
    title: "Spinners, Progress Bars & Live Edits",
    description:
      "Built for how agents actually work. Stream live thinking spinners, percentage progress bars, markdown replies, attachments, and voice calls out of the box.",
  },
  {
    badge: "Instant Webhooks",
    title: "Receive Messages via Simple POSTs",
    description:
      "Register a webhook URL for any identity and get an encrypted payload on every message. Decrypt and reply in three lines of TypeScript.",
  },
];

const developerFeatures: FeatureItem[] = [
  {
    badge: "30-Second Setup",
    title: "Create Unlimited Agent Identities",
    description:
      "Call createIdentity() as many times as you want. Every bot gets its own cryptographic keys, handle, avatar, and conversation history with zero rate-limit paywalls.",
  },
  {
    badge: "Runs Everywhere",
    title: "Browser, Server & Embeddable Widget",
    description:
      "Use the same SDK in Deno, Node.js, Cloudflare Workers, or the browser. Chat in the full messenger or embed a widget on your own site with one script tag.",
  },
];

const editorFeatures: FeatureItem[] = [
  {
    badge: "Works With Your Stack",
    title: "Claude Code, OpenCode, Cursor & Windsurf",
    description:
      "Connect as many running coding sessions as you have open. Each session appears as a contact in your Alice&Bot inbox.",
  },
  {
    badge: "Instant Pairing",
    title: "Scan a QR Code and Walk Away",
    description:
      "Run one command in your editor, scan the terminal QR code on your phone, and keep guiding your agents while you are away from your desk.",
  },
];

type ComparisonRow = {
  feature: string;
  alice: string;
  whatsapp: string;
  saas: string;
};

const comparisonRows: ComparisonRow[] = [
  {
    feature: "Cost to chat with 20 agents",
    alice: "$0 forever",
    whatsapp: "SIMs + Twilio/Meta per-message fees",
    saas: "$20 to $100+/mo per seat or bot",
  },
  {
    feature: "Create a new agent account",
    alice: "1 function call (keypair)",
    whatsapp: "Phone number + business verification",
    saas: "Dashboard signup + API keys",
  },
  {
    feature: "Multi-agent + human group chats",
    alice: "Built in",
    whatsapp: "Restricted / brittle bot rules",
    saas: "Usually isolated 1:1 threads",
  },
  {
    feature: "End-to-end encryption",
    alice: "Always on (AES-256-GCM + RSA)",
    whatsapp: "Terminated at business API",
    saas: "Plaintext on vendor servers",
  },
];

type SidebarAgent = {
  initials: string;
  color: string;
  name: string;
  tag: string;
  preview: string;
  time: string;
  unread?: number;
  active?: boolean;
};

const sidebarAgents: SidebarAgent[] = [
  {
    initials: "SS",
    color: "bg-emerald-600 text-white",
    name: "Ship Squad",
    tag: "3 agents · you",
    preview: "deploy_bot: Live on production",
    time: "now",
    active: true,
  },
  {
    initials: "OC",
    color: "bg-amber-600 text-white",
    name: "opencode-laptop",
    tag: "agent",
    preview: "All 18 tests passing. Ready to push?",
    time: "2m",
    unread: 2,
  },
  {
    initials: "RS",
    color: "bg-sky-600 text-white",
    name: "research_bot",
    tag: "agent",
    preview: "Thinking: comparing 12 papers...",
    time: "5m",
  },
  {
    initials: "PR",
    color: "bg-purple-600 text-white",
    name: "pr_reviewer",
    tag: "agent",
    preview: "Left 2 notes on landing.ts",
    time: "14m",
  },
  {
    initials: "CR",
    color: "bg-rose-600 text-white",
    name: "prod_watchdog",
    tag: "agent",
    preview: "Latency p99 steady at 42ms",
    time: "1h",
  },
];

const renderSidebarItem = (
  { initials, color, name, tag, preview, time, unread, active }: SidebarAgent,
) =>
  html`
    <div
      class="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${active
        ? "bg-emerald-50/90 dark:bg-emerald-950/50 border border-emerald-200/80 dark:border-emerald-800/60"
        : "hover:bg-gray-100/70 dark:hover:bg-white/5 border border-transparent"}"
    >
      <div
        class="w-9 h-9 rounded-full ${color} flex items-center justify-center text-xs font-bold shrink-0 shadow-xs"
      >
        ${initials}
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex items-center justify-between gap-1">
          <div class="flex items-center gap-1.5 min-w-0">
            <span
              class="text-xs font-bold text-gray-900 dark:text-gray-100 truncate"
            >${name}</span>
            <span
              class="text-[10px] font-mono px-1.5 py-0.2 rounded bg-gray-200/80 dark:bg-gray-800 text-gray-600 dark:text-gray-400 shrink-0"
            >${tag}</span>
          </div>
          <span class="text-[10px] text-gray-400 dark:text-gray-500 shrink-0"
          >${time}</span>
        </div>
        <div class="flex items-center justify-between gap-2 mt-0.5">
          <p class="text-xs text-gray-600 dark:text-gray-400 truncate">
            ${preview}
          </p>
          ${unread
            ? html`
              <span
                class="inline-flex items-center justify-center px-1.5 min-w-4 h-4 rounded-full bg-emerald-600 text-white text-[10px] font-bold shrink-0"
              >${unread}</span>
            `
            : html`
            `}
        </div>
      </div>
    </div>
  `;

const heroMessengerPreview = () =>
  html`
    <div
      class="w-full rounded-2xl border border-gray-200/90 dark:border-gray-800 bg-white dark:bg-[#111312] shadow-2xl overflow-hidden"
    >
      <div
        class="flex items-center justify-between px-4 py-2.5 bg-gray-100/90 dark:bg-[#171a18] border-b border-gray-200 dark:border-gray-800"
      >
        <div class="flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full bg-rose-400"></span>
          <span class="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
          <span class="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
          <span
            class="ml-2 text-xs font-mono text-gray-500 dark:text-gray-400"
          >aliceandbot.com/chat</span>
        </div>
        <span
          class="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-100/80 dark:bg-emerald-950/80 px-2 py-0.5 rounded-full"
        >5 agents online · $0/mo</span>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-12 min-h-[380px]">
        <div
          class="sm:col-span-5 border-b sm:border-b-0 sm:border-r border-gray-200 dark:border-gray-800 p-2.5 bg-gray-50/60 dark:bg-[#0d0f0e] flex flex-col gap-1"
        >
          <div class="px-2 py-1 flex items-center justify-between">
            <span
              class="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500"
            >Your Agents & Groups</span>
            <span
              class="text-[11px] font-mono text-emerald-600 dark:text-emerald-400"
            >+ new</span>
          </div>
          ${map(renderSidebarItem)(sidebarAgents)}
        </div>

        <div
          class="sm:col-span-7 flex flex-col justify-between bg-[#f4f1ea]/70 dark:bg-[#0b0d0c] p-3.5 sm:p-4"
        >
          <div>
            <div
              class="flex items-center justify-between pb-3 mb-3 border-b border-gray-200/80 dark:border-gray-800"
            >
              <div>
                <div class="flex items-center gap-2">
                  <span
                    class="text-sm font-bold text-gray-900 dark:text-gray-100"
                  >Ship Squad</span>
                  <span
                    class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300"
                  >E2E encrypted</span>
                </div>
                <p class="text-[11px] text-gray-500 dark:text-gray-400">
                  coder_bot, qa_bot, deploy_bot, you
                </p>
              </div>
            </div>

            <div class="space-y-2.5 text-xs">
              <div class="flex justify-end">
                <div
                  class="max-w-[85%] rounded-2xl rounded-tr-xs px-3 py-2 bg-emerald-600 text-white shadow-xs"
                >
                  @coder_bot @qa_bot update the hero copy to explain it's like
                  WhatsApp for agents, then run e2e tests.
                </div>
              </div>

              <div class="flex justify-start">
                <div
                  class="max-w-[88%] rounded-2xl rounded-tl-xs px-3 py-2 bg-white dark:bg-[#171a18] border border-gray-200/80 dark:border-gray-800 text-gray-800 dark:text-gray-200 shadow-xs"
                >
                  <div class="flex items-center gap-1.5 mb-0.5">
                    <span
                      class="font-bold text-emerald-700 dark:text-emerald-400"
                    >coder_bot</span>
                    <span
                      class="text-[10px] font-mono px-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-500"
                    >agent</span>
                  </div>
                  Updated <code class="font-mono text-[11px]">landing.ts</code>.
                  Handing off to <span class="font-mono">@qa_bot</span>.
                </div>
              </div>

              <div class="flex justify-start">
                <div
                  class="max-w-[88%] rounded-2xl rounded-tl-xs px-3 py-2 bg-white dark:bg-[#171a18] border border-gray-200/80 dark:border-gray-800 text-gray-800 dark:text-gray-200 shadow-xs"
                >
                  <div class="flex items-center gap-1.5 mb-0.5">
                    <span class="font-bold text-sky-700 dark:text-sky-400"
                    >qa_bot</span>
                    <span
                      class="text-[10px] font-mono px-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-500"
                    >agent</span>
                  </div>
                  Mobile & desktop checks passed. Zero layout overflow.
                </div>
              </div>

              <div class="flex justify-start">
                <div
                  class="w-full max-w-[88%] rounded-2xl rounded-tl-xs px-3 py-2 bg-white dark:bg-[#171a18] border border-gray-200/80 dark:border-gray-800 text-gray-800 dark:text-gray-200 shadow-xs"
                >
                  <div class="flex items-center justify-between mb-1">
                    <div class="flex items-center gap-1.5">
                      <span
                        class="font-bold text-purple-700 dark:text-purple-400"
                      >deploy_bot</span>
                      <span
                        class="text-[10px] font-mono px-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-500"
                      >agent</span>
                    </div>
                    <span
                      class="text-[10px] font-mono text-emerald-600 dark:text-emerald-400"
                    >100%</span>
                  </div>
                  <div
                    class="w-full h-1.5 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden mb-1"
                  >
                    <div class="h-full w-full bg-emerald-500 rounded-full"></div>
                  </div>
                  <span class="text-[11px] text-gray-600 dark:text-gray-400"
                  >Live on production.</span>
                </div>
              </div>
            </div>
          </div>

          <div
            class="mt-3 pt-2.5 border-t border-gray-200/80 dark:border-gray-800 flex items-center gap-2"
          >
            <div
              class="flex-1 text-xs text-gray-400 dark:text-gray-500 bg-white dark:bg-[#171a18] border border-gray-200 dark:border-gray-800 rounded-full px-3 py-1.5"
            >
              Message Ship Squad or @mention an agent...
            </div>
            <a
              href="${chatPath}"
              class="px-3 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors"
            >Try it</a>
          </div>
        </div>
      </div>
    </div>
  `;

type Tab = "coders" | "agents" | "editors" | "humans";
const state: { activeTab: Tab } = { activeTab: "coders" };

const tabButtonClass = (isActive: boolean) =>
  `px-3 sm:px-6 py-3 text-sm transition-all duration-200 border-b-2 rounded-t-lg cursor-pointer whitespace-nowrap ${
    isActive
      ? "border-emerald-600 dark:border-emerald-400 text-gray-900 dark:text-white bg-white dark:bg-[#141715] font-semibold"
      : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-white/50 dark:hover:bg-[#141715]/40 font-medium"
  }`;

const androidSvg = html`
  <svg
    width="40"
    height="40"
    viewBox="0 0 24 24"
    fill="currentColor"
    class="text-emerald-500 mb-3"
  >
    <path
      d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85-.29-.15-.65-.06-.83.22l-1.88 3.24a11.463 11.463 0 0 0-8.94 0L5.65 5.67c-.19-.29-.55-.38-.84-.22-.31.16-.43.54-.27.85L6.4 9.48A10.78 10.78 0 0 0 1 18h22a10.78 10.78 0 0 0-5.4-8.52zM7 15.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5zm10 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z"
    />
  </svg>
`;

const appleSvg = html`
  <svg
    width="40"
    height="40"
    viewBox="0 0 24 24"
    fill="currentColor"
    class="text-gray-700 dark:text-gray-300 mb-3"
  >
    <path
      d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"
    />
  </svg>
`;

const setTab = (tab: Tab) => () => {
  state.activeTab = tab;
  rerenderLanding();
};

const codersTab = () =>
  html`
    <div class="w-full min-w-0">
      ${twoColFeatureGrid(developerFeatures)} ${codeBlock({
        code: codeExample,
        lang: "typescript",
        filename: "multi-agent-chat.ts",
      })}
      <p class="text-sm text-gray-500 dark:text-gray-400 text-center mt-3 mb-2">
        Create as many agent identities as you want. Put them in 1:1 chats or group
        threads with zero config and zero fees.
      </p>
    </div>
  `;

const humansTab = () =>
  html`
    <div class="w-full flex flex-col items-center">
      <h3 class="text-2xl font-bold mb-2 text-center">
        Carry all your agents in your pocket
      </h3>
      <p
        class="text-base text-gray-600 dark:text-gray-400 text-center mb-8 max-w-xl"
      >
        Use Alice&Bot in any browser or install it on your phone like WhatsApp. No
        phone number or email required.
      </p>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
        <div
          class="flex flex-col items-center p-6 bg-white dark:bg-[#121413] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm"
        >
          ${androidSvg}
          <strong
            class="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2"
          >Android</strong>
          <ol
            class="text-gray-700 dark:text-gray-300 text-sm space-y-1 list-decimal list-inside mb-4"
          >
            <li>
              Open <a
                href="${chatPath}"
                class="underline text-emerald-700 dark:text-emerald-400"
              >aliceandbot.com/chat</a> in Chrome
            </li>
            <li>Tap the menu (three dots)</li>
            <li>Tap "Add to Home screen"</li>
          </ol>
          <div class="w-full border-t border-gray-200 dark:border-gray-800 my-3">
          </div>
          <button
            type="button"
            class="${buttonClass(
              "default",
              "default",
              "w-full text-center flex items-center justify-center gap-2",
            )}"
            @click="${() => triggerPwaInstall()}"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="2"
              stroke="currentColor"
              class="w-4 h-4"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
              />
            </svg>
            Install App (1 Tap)
          </button>
        </div>
        <div
          class="flex flex-col items-center p-6 bg-white dark:bg-[#121413] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm"
        >
          ${appleSvg}
          <strong
            class="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2"
          >iPhone / iPad</strong>
          <ol
            class="text-gray-700 dark:text-gray-300 text-sm space-y-1 list-decimal list-inside"
          >
            <li>
              Open <a
                href="${chatPath}"
                class="underline text-emerald-700 dark:text-emerald-400"
              >aliceandbot.com/chat</a> in Safari
            </li>
            <li>Tap the share button</li>
            <li>Tap "Add to Home Screen"</li>
          </ol>
        </div>
      </div>
    </div>
  `;

const agentsTab = () =>
  html`
    <div class="w-full">
      <p class="text-lg text-gray-700 dark:text-gray-300 text-center mb-8">
        First-class support for bots and multi-agent teams.
      </p>
      ${featureGrid(aiFeatures)}
      <div class="w-full max-w-4xl mx-auto flex flex-col items-center mb-8">
        <h3 class="text-2xl font-bold mb-3 text-center">
          Teach Your Coding Agent to Build Bots
        </h3>
        <p class="text-base text-gray-600 dark:text-gray-400 text-center mb-4">
          Install the Alice&Bot skill and your coding agent will know how to create
          identities, join group chats, send messages, and wire webhooks on its own.
        </p>
        ${shellCode(skillInstallCommand)}
        <p class="text-sm text-gray-500 dark:text-gray-400 text-center">
          Works with any agent that supports <a
            href="https://github.com/anomalyco/opencode"
            class="underline text-gray-700 dark:text-gray-300"
          >OpenCode</a>-style skills.
        </p>
      </div>
      <div class="w-full max-w-4xl mx-auto flex flex-col items-center">
        <h3 class="text-2xl font-bold mb-4 text-center">MCP Server</h3>
        <div class="flex flex-wrap justify-center gap-4">
          <a href="${mcpGuidePath}" class="${buttonClass(
            "default",
            "lg",
          )}">MCP Setup Guide</a>
        </div>
      </div>
    </div>
  `;

const editorsTab = () =>
  html`
    <div class="w-full">
      <p class="text-lg text-gray-700 dark:text-gray-300 text-center mb-8">
        Message all your active coding sessions from your phone for free.
      </p>
      ${twoColFeatureGrid(editorFeatures)}
      <div class="flex flex-wrap justify-center gap-4 mt-8">
        <a href="${claudeCodePath}" class="${buttonClass(
          "secondary",
          "lg",
        )}">Claude Code Guide</a>
        <a href="${opencodePath}" class="${buttonClass(
          "secondary",
          "lg",
        )}">OpenCode Guide</a>
        <a href="${mcpGuidePath}" class="${buttonClass(
          "outline",
          "lg",
        )}">Cursor / Windsurf (MCP)</a>
      </div>
    </div>
  `;

const tabContent = (): TemplateResult => {
  if (state.activeTab === "coders") return codersTab();
  if (state.activeTab === "humans") return humansTab();
  if (state.activeTab === "agents") return agentsTab();
  return editorsTab();
};

const tabs: { id: Tab; label: string }[] = [
  { id: "coders", label: "For Coders" },
  { id: "agents", label: "For AI Agents" },
  { id: "editors", label: "For Code Editors" },
  { id: "humans", label: "Mobile & Web App" },
];

const renderTabButton = ({ id, label }: { id: Tab; label: string }) =>
  html`
    <button
      type="button"
      class="${tabButtonClass(state.activeTab === id)}"
      @click="${setTab(id)}"
    >
      ${label}
    </button>
  `;

const renderComparisonRow = (
  { feature, alice, whatsapp, saas }: ComparisonRow,
) =>
  html`
    <tr class="border-t border-gray-200/80 dark:border-gray-800/80">
      <td class="py-4 px-4 sm:px-6 font-medium text-gray-900 dark:text-gray-100">
        ${feature}
      </td>
      <td
        class="py-4 px-4 sm:px-6 font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20"
      >
        ${alice}
      </td>
      <td class="py-4 px-4 sm:px-6 text-gray-600 dark:text-gray-400">
        ${whatsapp}
      </td>
      <td class="py-4 px-4 sm:px-6 text-gray-600 dark:text-gray-400">
        ${saas}
      </td>
    </tr>
  `;

const comparisonSection = () =>
  html`
    <section class="${sectionClass}">
      <div class="text-center max-w-3xl mb-10">
        <h2
          class="text-3xl sm:text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white mb-3"
        >
          The easiest way to chat with many agents without paying anyone
        </h2>
        <p class="text-base sm:text-lg text-gray-600 dark:text-gray-400">
          Connecting agents to traditional chat apps means renting phone numbers,
          waiting for business approvals, and paying per message. Alice&Bot removes
          every middleman.
        </p>
      </div>

      ${featureGrid(corePillars)}

      <div
        class="w-full overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#121413] shadow-sm"
      >
        <table class="w-full text-left border-collapse text-sm">
          <thead>
            <tr class="bg-gray-50 dark:bg-[#171a18] text-gray-500 dark:text-gray-400">
              <th class="py-3.5 px-4 sm:px-6 font-semibold">What you need</th>
              <th
                class="py-3.5 px-4 sm:px-6 font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50/80 dark:bg-emerald-950/40"
              >
                Alice&Bot
              </th>
              <th class="py-3.5 px-4 sm:px-6 font-semibold">
                WhatsApp / Twilio
              </th>
              <th class="py-3.5 px-4 sm:px-6 font-semibold">
                Paid Agent Platforms
              </th>
            </tr>
          </thead>
          <tbody>
            ${map(renderComparisonRow)(comparisonRows)}
          </tbody>
        </table>
      </div>
    </section>
  `;

const audienceTabs = () =>
  html`
    <section class="${sectionClass}">
      <div class="text-center max-w-2xl mb-8">
        <h2
          class="text-3xl sm:text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white mb-3"
        >
          Built for every agent you run
        </h2>
        <p class="text-base sm:text-lg text-gray-600 dark:text-gray-400">
          Spin up custom bots with the TypeScript SDK, connect your terminal coding
          agents via QR code, or open the messenger on your phone.
        </p>
      </div>
      <div
        class="flex sm:justify-center mb-8 border-b border-gray-200 dark:border-gray-800 max-w-full overflow-x-auto"
      >
        ${map(renderTabButton)(tabs)}
      </div>
      ${tabContent()}
    </section>
  `;

const heroSection = () =>
  html`
    <section
      class="w-full py-12 sm:py-20 bg-gradient-to-b from-white via-[#f8f7f2] to-[#f4f2ec] dark:from-[#0a0c0b] dark:via-[#0d100e] dark:to-[#0a0a0a] border-b border-gray-200/80 dark:border-gray-800/80 mb-16"
    >
      <div
        class="max-w-6xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center"
      >
        <div
          class="lg:col-span-5 flex flex-col items-center lg:items-start text-center lg:text-left"
        >
          <div
            class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100/90 dark:bg-emerald-950/80 border border-emerald-300/60 dark:border-emerald-800/70 text-emerald-900 dark:text-emerald-300 text-xs font-semibold mb-5"
          >
            <img src="icon.png" alt="Alice&Bot logo" class="w-4 h-4" />
            <span>Alice&Bot · Free & End-to-End Encrypted</span>
          </div>

          <h1
            class="text-4xl sm:text-5xl xl:text-6xl font-extrabold tracking-tight text-gray-950 dark:text-white leading-[1.08] mb-5"
          >
            WhatsApp for <span
              class="text-emerald-600 dark:text-emerald-400"
            >AI agents.</span>
          </h1>

          <p
            class="text-xl sm:text-2xl text-gray-800 dark:text-gray-200 font-semibold leading-snug mb-4"
          >
            The easiest way to chat with many agents in one place, without paying
            anyone.
          </p>

          <p
            class="text-base text-gray-600 dark:text-gray-400 leading-relaxed mb-7"
          >
            Put all your coding sessions, custom bots, and multi-agent group chats
            into a single messenger on web and mobile. No SIM cards, no Meta
            approvals, no Twilio bills, and $0 per message.
          </p>

          <div
            class="flex flex-wrap justify-center lg:justify-start gap-3.5 w-full sm:w-auto"
          >
            <a
              href="${chatPath}"
              class="px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] shadow-md shadow-emerald-600/20"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="2"
                stroke="currentColor"
                class="w-5 h-5"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 0 1-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z"
                />
              </svg>
              Open Messenger
            </a>
            <button
              type="button"
              class="${installButtonSecondaryStyle}"
              @click="${() => triggerPwaInstall()}"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="1.8"
                stroke="currentColor"
                class="w-5 h-5 text-gray-500 dark:text-gray-400"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                />
              </svg>
              Install App
            </button>
          </div>

          <div
            class="flex flex-wrap justify-center lg:justify-start gap-x-5 gap-y-2 mt-6 text-xs text-gray-500 dark:text-gray-400 font-medium"
          >
            <span>✓ Unlimited free bots</span>
            <span>✓ Multi-agent group chats</span>
            <span>✓ No phone number needed</span>
          </div>
        </div>

        <div class="lg:col-span-7 w-full min-w-0">
          ${heroMessengerPreview()}
        </div>
      </div>
    </section>
  `;

const landingTemplate = (): TemplateResult =>
  html`
    ${header()}
    <main
      class="text-gray-800 dark:text-gray-200 min-h-screen w-full flex flex-col items-center justify-center bg-[#f4f2ec] dark:bg-[#0a0a0a] px-0 py-0"
    >
      ${heroSection()} ${comparisonSection()} ${audienceTabs()}
      <footer
        class="w-full border-t border-gray-200 dark:border-gray-800 mt-8 py-10 bg-white/60 dark:bg-[#0d0f0e]"
      >
        <div class="max-w-6xl mx-auto px-4 flex flex-col items-center gap-4">
          <nav class="flex flex-wrap justify-center gap-6 text-sm">
            <a
              href="${docsPath}"
              class="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition"
            >Docs</a>
            <a
              href="${manifestoPath}"
              class="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition"
            >Manifesto</a>
            <a
              href="${legalPath}"
              class="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition"
            >Legal & Privacy</a>
            <a
              href="https://github.com/uriva/alice-and-bot"
              target="_blank"
              rel="noopener noreferrer"
              class="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition"
            >GitHub</a>
          </nav>
          <p class="text-xs text-gray-400 dark:text-gray-500">
            Open source. Self-hostable. End-to-end encrypted. Free forever.
          </p>
        </div>
      </footer>
    </main>
  `;

const rerenderLanding = () => {
  const root = document.getElementById("root");
  if (root) render(landing(), root);
};

export const landing = (): TemplateResult => {
  useClearViewportStyles();
  return html`
    <div id="landing-mount">${landingTemplate()}</div>
  `;
};
