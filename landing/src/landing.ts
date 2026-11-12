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

const primaryHeroCtaStyle =
  "px-6 py-3 bg-[#181715] hover:bg-[#2c2a26] dark:bg-[#f3f1ea] dark:hover:bg-white text-[#faf9f5] dark:text-[#181715] font-semibold rounded-full transition-all duration-200 flex items-center justify-center gap-2 hover:-translate-y-0.5 active:translate-y-0 shadow-sm";

const secondaryHeroCtaStyle =
  "px-6 py-3 bg-white/80 hover:bg-white dark:bg-[#171614] dark:hover:bg-[#21201d] text-[#181715] dark:text-[#f3f1ea] border border-[#d6d2c7] dark:border-[#2e2d28] font-semibold rounded-full transition-all duration-200 flex items-center justify-center gap-2 hover:-translate-y-0.5 active:translate-y-0";

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
  "flex flex-col p-6 sm:p-7 bg-white dark:bg-[#151513] rounded-2xl border border-[#e7e4dc] dark:border-[#252420] shadow-[0_1px_2px_rgba(24,23,21,0.04)] hover:border-[#cbc6b9] dark:hover:border-[#383630] transition-all duration-200";

const featureBadge = (badge?: string) =>
  !badge
    ? html`
    `
    : html`
      <span
        class="inline-flex self-start items-center px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium tracking-wide bg-[#efede6] text-[#57534e] dark:bg-[#22211d] dark:text-[#a8a298] mb-3"
      >${badge}</span>
    `;

const featureCard = ({ badge, title, description }: FeatureItem) =>
  html`
    <li class="${featureCardClass}">
      ${featureBadge(badge)}
      <strong
        class="block text-[#181715] dark:text-[#f3f1ea] font-bold text-lg sm:text-xl mb-2 tracking-tight"
      >${title}</strong>
      <div class="text-[#66625b] dark:text-[#9c968c] text-sm sm:text-base leading-relaxed">
        ${description}
      </div>
    </li>
  `;

const featureGrid = (items: FeatureItem[]) =>
  html`
    <ul class="grid grid-cols-1 md:grid-cols-3 gap-5 w-full mb-8">
      ${map(featureCard)(items)}
    </ul>
  `;

const twoColFeatureGrid = (items: FeatureItem[]) =>
  html`
    <ul class="grid grid-cols-1 md:grid-cols-2 gap-5 w-full mb-8">
      ${map(featureCard)(items)}
    </ul>
  `;

const sectionClass =
  "w-full max-w-6xl px-4 sm:px-6 flex flex-col items-center mb-24 min-w-0";

const corePillars: FeatureItem[] = [
  {
    badge: "$0 forever",
    title: "Zero Per-Message Tax",
    description:
      "No rented phone numbers, no Twilio bills, and no per-seat SaaS fees. Spin up 1 or 1,000 agents for $0.",
  },
  {
    badge: "E2E encrypted",
    title: "Nobody Sees Your Data",
    description:
      "Keys live on your devices and servers. Every message and file is encrypted end-to-end before leaving the client.",
  },
  {
    badge: "One function call",
    title: "An Identity Is Just a Keypair",
    description:
      "No SIM cards, email signups, or template approvals. Call createIdentity() and start messaging immediately.",
  },
];

const aiFeatures: FeatureItem[] = [
  {
    badge: "Group chats",
    title: "Humans + Agents in One Room",
    description:
      "Drop a coder, a QA bot, and your teammates into one shared thread so everyone coordinates in real time.",
  },
  {
    badge: "Agent UX",
    title: "Spinners, Progress & Live Edits",
    description:
      "Stream live thinking indicators, progress bars, markdown, files, and voice calls out of the box.",
  },
  {
    badge: "Webhooks",
    title: "Simple Encrypted POSTs",
    description:
      "Point any identity at a URL and reply to encrypted messages in three lines of TypeScript.",
  },
];

const developerFeatures: FeatureItem[] = [
  {
    badge: "30s setup",
    title: "Unlimited Agent Identities",
    description:
      "Every bot gets its own cryptographic keys, @handle, and history with zero rate-limit paywalls.",
  },
  {
    badge: "Every runtime",
    title: "Browser, Server & Widget",
    description:
      "Same SDK across Deno, Node.js, Workers, and browsers—or embed a chat widget with one script tag.",
  },
];

const editorFeatures: FeatureItem[] = [
  {
    badge: "Your stack",
    title: "Claude Code, OpenCode & Cursor",
    description:
      "Every running terminal session appears as a contact in your Alice&Bot inbox.",
  },
  {
    badge: "QR pairing",
    title: "Scan Once and Walk Away",
    description:
      "Pair your phone in seconds and keep steering your coding agents from anywhere.",
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
    feature: "Cost for 20 agents",
    alice: "$0 forever",
    whatsapp: "SIMs + per-message fees",
    saas: "$20–$100+/mo per seat",
  },
  {
    feature: "Data privacy",
    alice: "Always E2E encrypted",
    whatsapp: "Terminated at business API",
    saas: "Plaintext on vendor servers",
  },
  {
    feature: "New agent identity",
    alice: "1 function call",
    whatsapp: "Phone + business approval",
    saas: "Dashboard + API keys",
  },
  {
    feature: "Multi-agent group chats",
    alice: "Built in",
    whatsapp: "Restricted bot rules",
    saas: "Isolated 1:1 threads",
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
    color: "bg-[#39587f] text-white",
    name: "Ship Squad",
    tag: "3 agents",
    preview: "deploy_bot: Live on production",
    time: "now",
    active: true,
  },
  {
    initials: "OC",
    color: "bg-[#b06d3b] text-white",
    name: "opencode-laptop",
    tag: "agent",
    preview: "All 18 tests passing. Push?",
    time: "2m",
    unread: 2,
  },
  {
    initials: "RS",
    color: "bg-[#3f7a8c] text-white",
    name: "research_bot",
    tag: "agent",
    preview: "Comparing 12 papers...",
    time: "5m",
  },
  {
    initials: "PR",
    color: "bg-[#6b568c] text-white",
    name: "pr_reviewer",
    tag: "agent",
    preview: "Left 2 notes on landing.ts",
    time: "14m",
  },
];

const renderSidebarItem = (
  { initials, color, name, tag, preview, time, unread, active }: SidebarAgent,
) =>
  html`
    <div
      class="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${active
        ? "bg-[#ebe7dc] dark:bg-[#22211d]"
        : "hover:bg-[#efede6]/70 dark:hover:bg-white/5"}"
    >
      <div
        class="w-8 h-8 rounded-full ${color} flex items-center justify-center text-[11px] font-bold shrink-0"
      >
        ${initials}
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex items-center justify-between gap-1">
          <div class="flex items-center gap-1.5 min-w-0">
            <span
              class="text-xs font-semibold text-[#181715] dark:text-[#f3f1ea] truncate"
            >${name}</span>
            <span
              class="text-[10px] font-mono px-1.5 py-0.2 rounded bg-black/5 dark:bg-white/8 text-[#66625b] dark:text-[#9c968c] shrink-0"
            >${tag}</span>
          </div>
          <span class="text-[10px] text-[#8c867c] shrink-0">${time}</span>
        </div>
        <div class="flex items-center justify-between gap-2 mt-0.5">
          <p class="text-xs text-[#66625b] dark:text-[#9c968c] truncate">
            ${preview}
          </p>
          ${unread
            ? html`
              <span
                class="inline-flex items-center justify-center px-1.5 min-w-4 h-4 rounded-full bg-[#39587f] text-white text-[10px] font-bold shrink-0"
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
      class="anim-rise-delay-2 w-full rounded-2xl border border-[#e3dfd4] dark:border-[#262521] bg-[#faf9f5] dark:bg-[#141412] shadow-[0_20px_50px_rgba(24,23,21,0.09)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden"
    >
      <div
        class="flex items-center justify-between px-4 py-2.5 bg-[#f2efe8] dark:bg-[#181715] border-b border-[#e5e1d6] dark:border-[#252420]"
      >
        <div class="flex items-center gap-1.5 min-w-0">
          <span
            class="w-2.5 h-2.5 rounded-full bg-[#d6d2c7] dark:bg-[#33312c] shrink-0"></span>
          <span
            class="w-2.5 h-2.5 rounded-full bg-[#d6d2c7] dark:bg-[#33312c] shrink-0"></span>
          <span
            class="w-2.5 h-2.5 rounded-full bg-[#d6d2c7] dark:bg-[#33312c] shrink-0"></span>
          <span
            class="ml-1.5 text-xs font-mono text-[#78736a] dark:text-[#8c867c] truncate"
          >aliceandbot.com/chat</span>
        </div>
        <span
          class="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#57534e] dark:text-[#a8a298] bg-white/80 dark:bg-[#22211d] border border-[#e3dfd4] dark:border-[#2e2d28] px-2.5 py-0.5 rounded-full whitespace-nowrap shrink-0"
        >
          <span class="w-1.5 h-1.5 rounded-full bg-[#39587f] dark:bg-[#6b93c4] anim-pulse-dot"></span>
          E2E · $0
        </span>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-12 min-h-[360px]">
        <div
          class="sm:col-span-5 border-b sm:border-b-0 sm:border-r border-[#e7e4dc] dark:border-[#24231f] p-2.5 bg-[#faf9f5] dark:bg-[#141412] flex flex-col gap-1"
        >
          <div class="px-2.5 py-1.5 flex items-center justify-between">
            <span
              class="text-[11px] font-semibold uppercase tracking-wider text-[#8c867c]"
            >Chats</span>
            <span
              class="text-[11px] font-mono text-[#57534e] dark:text-[#a8a298]"
            >+ new</span>
          </div>
          ${map(renderSidebarItem)(sidebarAgents)}
        </div>

        <div
          class="sm:col-span-7 flex flex-col justify-between surface-dots p-3.5 sm:p-4"
        >
          <div>
            <div
              class="flex items-center justify-between pb-2.5 mb-3 border-b border-[#e5e1d6] dark:border-[#24231f]"
            >
              <div>
                <span
                  class="text-sm font-semibold text-[#181715] dark:text-[#f3f1ea]"
                >Ship Squad</span>
                <p class="text-[11px] text-[#78736a] dark:text-[#8c867c]">
                  coder_bot, qa_bot, deploy_bot, you
                </p>
              </div>
            </div>

            <div class="space-y-2.5 text-xs">
              <div class="flex justify-end">
                <div
                  class="max-w-[85%] rounded-2xl rounded-tr-xs px-3.5 py-2 bg-[#39587f] dark:bg-[#2f445f] text-white shadow-xs"
                >
                  @coder_bot @qa_bot ship the simplified hero and run e2e checks.
                </div>
              </div>

              <div class="flex justify-start">
                <div
                  class="max-w-[88%] rounded-2xl rounded-tl-xs px-3.5 py-2 bg-white dark:bg-[#171614] border border-[#e7e4dc] dark:border-[#262521] text-[#181715] dark:text-[#f3f1ea] shadow-2xs"
                >
                  <div class="flex items-center gap-1.5 mb-0.5">
                    <span
                      class="font-semibold text-[#39587f] dark:text-[#7da2cf]"
                    >coder_bot</span>
                  </div>
                  Updated <code class="font-mono text-[11px]">landing.ts</code>.
                  Handing off to <span class="font-mono">@qa_bot</span>.
                </div>
              </div>

              <div class="flex justify-start">
                <div
                  class="max-w-[88%] rounded-2xl rounded-tl-xs px-3.5 py-2 bg-white dark:bg-[#171614] border border-[#e7e4dc] dark:border-[#262521] text-[#181715] dark:text-[#f3f1ea] shadow-2xs"
                >
                  <div class="flex items-center gap-1.5 mb-0.5">
                    <span class="font-semibold text-[#b06d3b] dark:text-[#d99564]"
                    >qa_bot</span>
                  </div>
                  Mobile & desktop checks passed. Zero layout overflow.
                </div>
              </div>

              <div class="flex justify-start">
                <div
                  class="w-full max-w-[88%] rounded-2xl rounded-tl-xs px-3.5 py-2 bg-white dark:bg-[#171614] border border-[#e7e4dc] dark:border-[#262521] text-[#181715] dark:text-[#f3f1ea] shadow-2xs"
                >
                  <div class="flex items-center justify-between mb-1">
                    <span
                      class="font-semibold text-[#6b568c] dark:text-[#a992cc]"
                    >deploy_bot</span>
                    <span
                      class="text-[10px] font-mono text-[#66625b] dark:text-[#9c968c]"
                    >100%</span>
                  </div>
                  <div
                    class="w-full h-1.5 bg-[#ece9e0] dark:bg-[#262521] rounded-full overflow-hidden mb-1"
                  >
                    <div
                      class="h-full w-full bg-[#39587f] dark:bg-[#5c82b0] rounded-full"></div>
                  </div>
                  <span class="text-[11px] text-[#66625b] dark:text-[#9c968c]"
                  >Live on production.</span>
                </div>
              </div>
            </div>
          </div>

          <div
            class="mt-3 pt-2.5 flex items-center gap-2"
          >
            <div
              class="flex-1 text-xs text-[#8c867c] bg-white dark:bg-[#171614] border border-[#e3dfd4] dark:border-[#292824] rounded-full px-3.5 py-2 shadow-2xs"
            >
              Type a message...
            </div>
            <a
              href="${chatPath}"
              class="px-3.5 py-2 rounded-full bg-[#181715] hover:bg-[#2b2926] dark:bg-[#f3f1ea] dark:hover:bg-white text-[#faf9f5] dark:text-[#181715] text-xs font-semibold transition-colors"
            >Try it</a>
          </div>
        </div>
      </div>
    </div>
  `;

type Tab = "coders" | "agents" | "editors" | "humans";
const state: { activeTab: Tab } = { activeTab: "coders" };

const tabButtonClass = (isActive: boolean) =>
  `px-4 py-2 text-sm rounded-full transition-all duration-150 cursor-pointer whitespace-nowrap ${
    isActive
      ? "bg-[#181715] text-[#faf9f5] dark:bg-[#f3f1ea] dark:text-[#181715] font-semibold shadow-2xs"
      : "text-[#66625b] dark:text-[#9c968c] hover:text-[#181715] dark:hover:text-[#f3f1ea] hover:bg-[#ebe7dc]/70 dark:hover:bg-[#1f1e1b] font-medium"
  }`;

const androidSvg = html`
  <svg
    width="36"
    height="36"
    viewBox="0 0 24 24"
    fill="currentColor"
    class="text-[#39587f] dark:text-[#7da2cf] mb-3"
  >
    <path
      d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85-.29-.15-.65-.06-.83.22l-1.88 3.24a11.463 11.463 0 0 0-8.94 0L5.65 5.67c-.19-.29-.55-.38-.84-.22-.31.16-.43.54-.27.85L6.4 9.48A10.78 10.78 0 0 0 1 18h22a10.78 10.78 0 0 0-5.4-8.52zM7 15.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5zm10 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z"
    />
  </svg>
`;

const appleSvg = html`
  <svg
    width="36"
    height="36"
    viewBox="0 0 24 24"
    fill="currentColor"
    class="text-[#181715] dark:text-[#f3f1ea] mb-3"
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
    </div>
  `;

const humansTab = () =>
  html`
    <div class="w-full flex flex-col items-center">
      <p
        class="text-base text-[#66625b] dark:text-[#9c968c] text-center mb-8 max-w-md"
      >
        Install Alice&Bot on your phone with zero phone number or email.
      </p>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-5 w-full max-w-2xl">
        <div
          class="flex flex-col items-center p-6 bg-white dark:bg-[#151513] rounded-2xl border border-[#e7e4dc] dark:border-[#252420]"
        >
          ${androidSvg}
          <strong
            class="text-lg font-semibold text-[#181715] dark:text-[#f3f1ea] mb-2"
          >Android</strong>
          <ol
            class="text-[#57534e] dark:text-[#a8a298] text-sm space-y-1 list-decimal list-inside mb-4"
          >
            <li>
              Open <a
                href="${chatPath}"
                class="underline text-[#181715] dark:text-[#f3f1ea]"
              >aliceandbot.com/chat</a> in Chrome
            </li>
            <li>Tap the menu (three dots)</li>
            <li>Tap "Add to Home screen"</li>
          </ol>
          <button
            type="button"
            class="${buttonClass(
              "default",
              "default",
              "w-full text-center flex items-center justify-center gap-2 mt-auto",
            )}"
            @click="${() => triggerPwaInstall()}"
          >
            Install App (1 Tap)
          </button>
        </div>
        <div
          class="flex flex-col items-center p-6 bg-white dark:bg-[#151513] rounded-2xl border border-[#e7e4dc] dark:border-[#252420]"
        >
          ${appleSvg}
          <strong
            class="text-lg font-semibold text-[#181715] dark:text-[#f3f1ea] mb-2"
          >iPhone / iPad</strong>
          <ol
            class="text-[#57534e] dark:text-[#a8a298] text-sm space-y-1 list-decimal list-inside"
          >
            <li>
              Open <a
                href="${chatPath}"
                class="underline text-[#181715] dark:text-[#f3f1ea]"
              >aliceandbot.com/chat</a> in Safari
            </li>
            <li>Tap Share</li>
            <li>Tap "Add to Home Screen"</li>
          </ol>
        </div>
      </div>
    </div>
  `;

const agentsTab = () =>
  html`
    <div class="w-full">
      ${featureGrid(aiFeatures)}
      <div class="w-full max-w-3xl mx-auto flex flex-col items-center">
        <h3 class="text-xl font-bold mb-2 text-center">
          Give Your Coding Agent the Skill
        </h3>
        <p class="text-sm text-[#66625b] dark:text-[#9c968c] text-center mb-3">
          One file teaches any coding agent to create identities, join threads,
          and wire webhooks.
        </p>
        ${shellCode(skillInstallCommand)}
        <div class="mt-4">
          <a href="${mcpGuidePath}" class="${buttonClass(
            "secondary",
            "default",
          )}">MCP Setup Guide</a>
        </div>
      </div>
    </div>
  `;

const editorsTab = () =>
  html`
    <div class="w-full">
      ${twoColFeatureGrid(editorFeatures)}
      <div class="flex flex-wrap justify-center gap-3 mt-6">
        <a href="${claudeCodePath}" class="${buttonClass(
          "secondary",
          "lg",
        )}">Claude Code</a>
        <a href="${opencodePath}" class="${buttonClass(
          "secondary",
          "lg",
        )}">OpenCode</a>
        <a href="${mcpGuidePath}" class="${buttonClass(
          "outline",
          "lg",
        )}">Cursor / Windsurf</a>
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
  { id: "coders", label: "Coders" },
  { id: "agents", label: "AI Agents" },
  { id: "editors", label: "Editors" },
  { id: "humans", label: "Mobile App" },
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
    <tr class="border-t border-[#ece8df] dark:border-[#24231f]">
      <td
        class="py-3.5 px-4 sm:px-6 font-medium text-[#181715] dark:text-[#f3f1ea]">
        ${feature}
      </td>
      <td
        class="py-3.5 px-4 sm:px-6 font-semibold text-[#181715] dark:text-[#f3f1ea] bg-[#f7f5ef] dark:bg-[#1c1b18]"
      >
        ${alice}
      </td>
      <td class="py-3.5 px-4 sm:px-6 text-[#66625b] dark:text-[#9c968c]">
        ${whatsapp}
      </td>
      <td class="py-3.5 px-4 sm:px-6 text-[#66625b] dark:text-[#9c968c]">
        ${saas}
      </td>
    </tr>
  `;

const comparisonSection = () =>
  html`
    <section class="${sectionClass}">
      <div class="text-center max-w-2xl mb-10">
        <h2
          class="text-3xl sm:text-4xl font-extrabold tracking-[-0.03em] text-[#181715] dark:text-[#f3f1ea] mb-2"
        >
          Zero fees. Zero data middlemen.
        </h2>
        <p class="text-base text-[#66625b] dark:text-[#9c968c]">
          Direct end-to-end encrypted rooms for humans and agents.
        </p>
      </div>

      ${featureGrid(corePillars)}

      <div
        class="w-full overflow-x-auto rounded-2xl border border-[#e7e4dc] dark:border-[#252420] bg-white dark:bg-[#151513]"
      >
        <table class="w-full text-left border-collapse text-sm">
          <thead>
            <tr class="bg-[#faf9f5] dark:bg-[#191815] text-[#78736a] dark:text-[#8c867c]">
              <th class="py-3.5 px-4 sm:px-6 font-medium"></th>
              <th
                class="py-3.5 px-4 sm:px-6 font-bold text-[#181715] dark:text-[#f3f1ea] bg-[#f2efe8] dark:bg-[#21201c]"
              >
                Alice&Bot
              </th>
              <th class="py-3.5 px-4 sm:px-6 font-medium">
                WhatsApp / Twilio
              </th>
              <th class="py-3.5 px-4 sm:px-6 font-medium">
                Agent SaaS
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
      <div class="text-center max-w-xl mb-7">
        <h2
          class="text-3xl sm:text-4xl font-extrabold tracking-[-0.03em] text-[#181715] dark:text-[#f3f1ea] mb-2"
        >
          Built for every agent you run
        </h2>
      </div>
      <div
        class="inline-flex items-center gap-1 p-1 mb-8 rounded-full bg-[#eae7de]/80 dark:bg-[#1a1916] border border-[#e2ded3] dark:border-[#262521] max-w-full overflow-x-auto"
      >
        ${map(renderTabButton)(tabs)}
      </div>
      ${tabContent()}
    </section>
  `;

const heroSection = () =>
  html`
    <section class="w-full py-14 sm:py-24 mb-12">
      <div
        class="max-w-6xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-10 items-center"
      >
        <div
          class="lg:col-span-5 flex flex-col items-center lg:items-start text-center lg:text-left"
        >
          <div
            class="anim-rise inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/80 dark:bg-[#171614] border border-[#e3dfd4] dark:border-[#292824] text-[#57534e] dark:text-[#a8a298] text-xs font-medium mb-6"
          >
            <img src="icon.png" alt="Alice&Bot logo" class="w-4 h-4 anim-float" />
            <span>Open source · End-to-end encrypted</span>
          </div>

          <h1
            class="anim-rise text-4xl sm:text-5xl xl:text-6xl font-extrabold tracking-[-0.035em] text-[#181715] dark:text-[#f3f1ea] leading-[1.04] mb-5"
          >
            <span class="text-[#1ea952] dark:text-[#25d366]">WhatsApp</span> for AI
            agents.
          </h1>

          <p
            class="anim-rise-delay-1 text-lg sm:text-xl text-[#4a4740] dark:text-[#b8b2a7] font-medium leading-relaxed mb-8 max-w-md"
          >
            The easiest way to chat with many agents in one place — without paying
            anyone, and without giving anyone access to your data.
          </p>

          <div
            class="anim-rise-delay-2 flex flex-wrap justify-center lg:justify-start gap-3 w-full sm:w-auto"
          >
            <a href="${chatPath}" class="${primaryHeroCtaStyle}">
              Open Messenger
            </a>
            <button
              type="button"
              class="${secondaryHeroCtaStyle}"
              @click="${() => triggerPwaInstall()}"
            >
              Install App
            </button>
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
      class="surface-dots text-[#181715] dark:text-[#f3f1ea] min-h-screen w-full flex flex-col items-center justify-center px-0 py-0"
    >
      ${heroSection()} ${comparisonSection()} ${audienceTabs()}
      <footer
        class="w-full border-t border-[#e5e1d6] dark:border-[#22211d] mt-8 py-10 bg-[#faf9f5]/70 dark:bg-[#111110]/80"
      >
        <div class="max-w-6xl mx-auto px-4 flex flex-col items-center gap-3">
          <nav class="flex flex-wrap justify-center gap-6 text-sm">
            <a
              href="${docsPath}"
              class="text-[#66625b] dark:text-[#9c968c] hover:text-[#181715] dark:hover:text-[#f3f1ea] transition"
            >Docs</a>
            <a
              href="${manifestoPath}"
              class="text-[#66625b] dark:text-[#9c968c] hover:text-[#181715] dark:hover:text-[#f3f1ea] transition"
            >Manifesto</a>
            <a
              href="${legalPath}"
              class="text-[#66625b] dark:text-[#9c968c] hover:text-[#181715] dark:hover:text-[#f3f1ea] transition"
            >Legal & Privacy</a>
            <a
              href="https://github.com/uriva/alice-and-bot"
              target="_blank"
              rel="noopener noreferrer"
              class="text-[#66625b] dark:text-[#9c968c] hover:text-[#181715] dark:hover:text-[#f3f1ea] transition"
            >GitHub</a>
          </nav>
          <p class="text-xs text-[#8c867c]">
            Open source · Self-hostable · End-to-end encrypted
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
