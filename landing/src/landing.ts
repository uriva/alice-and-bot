import { html, render, type TemplateResult } from "lit";
import { buttonClass, codeBlock, shellCode } from "./components.ts";
import { header } from "./header.ts";
import {
  chatPath,
  claudeCodePath,
  legalPath,
  mcpGuidePath,
  opencodePath,
} from "./paths.ts";
import { useClearViewportStyles } from "./clear-viewport-styles.ts";

const skillInstallCommand = `mkdir -p ~/.agents/skills/alice-and-bot
curl -o ~/.agents/skills/alice-and-bot/SKILL.md \\
  https://raw.githubusercontent.com/uriva/alice-and-bot/main/skill/SKILL.md`;

const codeExample =
  `import { createConversation, createIdentity, sendMessage, setWebhook } from "@alice-and-bot/core";

const alice = await createIdentity("Alice", "alice");
const bot = await createIdentity("My Bot", "my_bot");

const { conversationId } = await createConversation(
  [alice.publicSignKey, bot.publicSignKey], "Hello", alice,
);

await sendMessage({
  credentials: alice,
  conversation: conversationId,
  message: { type: "text", text: "Hey bot!" },
});

await setWebhook({ url: "https://my-server.com/hook", credentials: bot });`;

const featureCardClass =
  "flex flex-col p-8 bg-white/90 dark:bg-[#111]/80 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xl hover:scale-105 hover:shadow-2xl transition-transform duration-200 ease-out";

const featureCard = (
  { title, description }: { title: string; description: string },
) =>
  html`
    <li class="${featureCardClass}">
      <strong
        class="block text-gray-800 dark:text-gray-200 font-semibold text-xl mb-2"
      >${title}</strong>
      <div class="text-gray-700 dark:text-gray-200 text-base">${description}</div>
    </li>
  `;

const featureGrid = (items: { title: string; description: string }[]) =>
  html`
    <ul class="grid grid-cols-1 md:grid-cols-3 gap-8 w-full mb-8">${items.map(
      featureCard,
    )}</ul>
  `;

const sectionClass =
  "w-full max-w-6xl px-4 flex flex-col items-center mb-16 min-w-0";

const humanFeatures = [
  {
    title: "No Phone Number Required",
    description:
      "Create and manage as many identities as you want, with no phone or email required. Perfect for privacy and creative use cases.",
  },
  {
    title: "Portable, Secure Identity",
    description:
      "Your identity is a public/private key pair. Take your address book with you, even if you switch providers. End-to-end encryption is always on.",
  },
  {
    title: "Spam Resistant by Design",
    description:
      "Each account can set a cold-outreach price. Anyone starting a new conversation pays this amount from their balance. No more endless spam, no more captchas.",
  },
];

const aiFeatures = [
  {
    title: "Bot-First Design",
    description:
      "Create accounts for bots or AI agents without bureaucracy. No phone verification, no arbitrary restrictions.",
  },
  {
    title: "Built-in Monetization",
    description:
      "Set a price tag on your bot's profile. Users pay this fee to initiate a chat, crediting your account instantly. Zero payment gateway hassle.",
  },
  {
    title: "Webhook-Driven",
    description:
      "Receive messages via webhooks. Your AI agent gets a POST request for every incoming message, ready to respond.",
  },
];

const developerFeatures = [
  {
    title: "APIs & Webhooks by Default",
    description:
      "Send and receive messages via API and webhooks. No extra cost, no friction. Cloud storage is built in for device independence.",
  },
  {
    title: "Built-in Monetization",
    description:
      "Easily monetize your agents. Balances are tracked in USD cents and managed automatically by built-in ledgers, so you can focus on building.",
  },
  {
    title: "Browser & Server",
    description:
      "All functions work in both browser and server environments. Build from wherever you are.",
  },
];

const editorFeatures = [
  {
    title: "Works Everywhere",
    description:
      "Claude Code, Cursor, Windsurf, VS Code — any editor that supports MCP.",
  },
  {
    title: "QR Code Setup",
    description:
      "Ask your agent to set up Alice&Bot. Scan the QR code, and you're chatting with your session.",
  },
  {
    title: "End-to-End Encrypted",
    description:
      "Messages are encrypted on your device. The relay never sees plaintext.",
  },
];

type Tab = "coders" | "humans" | "agents" | "editors";
let activeTab: Tab = "coders";

const tabButtonClass = (isActive: boolean) =>
  `px-3 sm:px-6 py-3 text-sm transition-all duration-200 border-b-2 rounded-t-lg cursor-pointer whitespace-nowrap ${
    isActive
      ? "border-gray-800 dark:border-gray-200 text-gray-900 dark:text-white bg-gray-100 dark:bg-[#1a1a1a] font-semibold"
      : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#1a1a1a]/20 font-medium"
  }`;

const androidSvg = html`
  <svg
    width="40"
    height="40"
    viewBox="0 0 24 24"
    fill="currentColor"
    class="text-green-500 mb-3"
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
  activeTab = tab;
  rerenderLanding();
};

const tabContent = (): TemplateResult => {
  if (activeTab === "coders") {
    return html`
      <div class="w-full min-w-0">
        ${featureGrid(developerFeatures)} ${codeBlock({
          code: codeExample,
          lang: "typescript",
          filename: "example.ts",
        })}
        <p class="text-sm text-gray-500 dark:text-gray-400 text-center mt-2 mb-4">
          TypeScript SDK with end-to-end encryption, webhooks, and device sync.
        </p>
      </div>
    `;
  }
  if (activeTab === "humans") {
    return html`
      <div>
        <h3 class="text-2xl font-bold mb-6 text-center">Install on your phone</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
          <div
            class="flex flex-col items-center p-6 bg-white/90 dark:bg-[#111]/80 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xl"
          >
            ${androidSvg}
            <strong
              class="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2"
            >Android</strong>
            <ol
              class="text-gray-700 dark:text-gray-200 text-sm space-y-1 list-decimal list-inside"
            >
              <li>
                Open <a
                  href="${chatPath}"
                  class="underline text-gray-700 dark:text-gray-400"
                >aliceandbot.com/chat</a> in Chrome
              </li>
              <li>Tap the menu (three dots)</li>
              <li>Tap "Add to Home screen"</li>
            </ol>
          </div>
          <div
            class="flex flex-col items-center p-6 bg-white/90 dark:bg-[#111]/80 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xl"
          >
            ${appleSvg}
            <strong
              class="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2"
            >iPhone / iPad</strong>
            <ol
              class="text-gray-700 dark:text-gray-200 text-sm space-y-1 list-decimal list-inside"
            >
              <li>
                Open <a
                  href="${chatPath}"
                  class="underline text-gray-700 dark:text-gray-400"
                >aliceandbot.com/chat</a> in Safari
              </li>
              <li>Tap the share button</li>
              <li>Tap "Add to Home Screen"</li>
            </ol>
          </div>
        </div>
      </div>
    `;
  }
  if (activeTab === "agents") {
    return html`
      <div>
        <p class="text-lg text-gray-700 dark:text-gray-300 text-center mb-8">
          First-class support for bots and AI agents.
        </p>
        ${featureGrid(aiFeatures)}
        <div class="w-full max-w-4xl mx-auto flex flex-col items-center mb-8">
          <h3 class="text-2xl font-bold mb-4 text-center">Skill</h3>
          <p class="text-lg text-gray-700 dark:text-gray-300 text-center mb-4">
            Give your AI coding agent the ability to build bots on Alice&Bot. Install
            the skill and your agent will know how to create identities, send
            messages, set up webhooks, and more.
          </p>
          ${shellCode(skillInstallCommand)}
          <p class="text-sm text-gray-500 dark:text-gray-400 text-center">
            Works with any agent that supports <a
              href="https://github.com/anomalyco/opencode"
              class="underline text-gray-700 dark:text-gray-400"
            >OpenCode</a>-style skills.
          </p>
        </div>
        <div class="w-full max-w-4xl mx-auto flex flex-col items-center">
          <h3 class="text-2xl font-bold mb-4 text-center">MCP</h3>
          <div class="flex flex-wrap justify-center gap-4">
            <a href="${mcpGuidePath}" class="${buttonClass(
              "default",
              "lg",
            )}">Setup Guide</a>
          </div>
        </div>
      </div>
    `;
  }
  return html`
    <div>
      <p class="text-lg text-gray-700 dark:text-gray-300 text-center mb-8">
        Chat with your coding sessions from your phone.
      </p>
      ${featureGrid(editorFeatures)}
      <div class="flex flex-wrap justify-center gap-4 mt-8">
        <a href="${claudeCodePath}" class="${buttonClass(
          "secondary",
          "lg",
        )}">Claude Code</a>
        <a href="${opencodePath}" class="${buttonClass(
          "secondary",
          "lg",
        )}">OpenCode</a>
      </div>
    </div>
  `;
};

const tabs: { id: Tab; label: string }[] = [
  { id: "coders", label: "For Coders" },
  { id: "humans", label: "For Humans" },
  { id: "agents", label: "For AI Agents" },
  { id: "editors", label: "For Code Editors" },
];

const audienceTabs = () =>
  html`
    <section class="${sectionClass}">
      <div class="mb-12">${featureGrid(humanFeatures)}</div>
      <div
        class="flex sm:justify-center mb-8 border-b border-gray-200 dark:border-gray-700 max-w-full overflow-x-auto"
      >
        ${tabs.map(({ id, label }) =>
          html`
            <button type="button" class="${tabButtonClass(
              activeTab === id,
            )}" @click="${setTab(id)}">
              ${label}
            </button>
          `
        )}
      </div>
      ${tabContent()}
    </section>
  `;

const landingTemplate = (): TemplateResult =>
  html`
    ${header()}
    <main
      class="text-gray-800 dark:text-gray-200 min-h-screen w-full flex flex-col items-center justify-center bg-[#f8f7f4] dark:bg-[#0a0a0a] px-0 py-0"
    >
      <section
        class="w-full py-20 flex flex-col items-center justify-center bg-white dark:bg-[#0a0a0a] border-b border-gray-200 dark:border-gray-800 mb-12"
      >
        <div class="flex flex-col items-center">
          <img
            src="icon.png"
            alt="Alice&Bot logo"
            style="width:180px"
            class="mb-6"
          />
          <h1
            class="text-5xl md:text-6xl font-extrabold tracking-tight text-gray-900 dark:text-white mb-4"
          >
            Alice&Bot
          </h1>
          <p
            class="text-2xl md:text-3xl text-gray-700 dark:text-gray-200 font-semibold max-w-2xl text-center mb-4"
          >
            Let's unbreak chat.
          </p>
          <p class="text-lg text-gray-600 dark:text-gray-400 max-w-xl text-center">
            The developer-first, privacy-first chat platform. No phone numbers. No
            bureaucracy.
          </p>
        </div>
      </section>
      ${audienceTabs()}
      <footer
        class="w-full border-t border-gray-200 dark:border-gray-700 mt-16 py-8"
      >
        <div class="max-w-6xl mx-auto px-4 flex flex-col items-center gap-4">
          <nav class="flex flex-wrap justify-center gap-6 text-sm">
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
            Open source. Self-hostable. Your data belongs to you.
          </p>
        </div>
      </footer>
    </main>
  `;

let landingContainer: HTMLElement | null = null;

const rerenderLanding = () => {
  if (landingContainer) render(landingTemplate(), landingContainer);
};

export const landing = (): TemplateResult => {
  useClearViewportStyles();
  const id = "landing-mount";
  setTimeout(() => {
    landingContainer = document.getElementById(id);
  });
  return html`
    <div id="${id}">${landingTemplate()}</div>
  `;
};
