import hljs from "highlight.js/lib/core";
import typescript from "highlight.js/lib/languages/typescript";
import "highlight.js/styles/github-dark.css";
import { FaAndroid, FaApple, FaGithub } from "react-icons/fa";
import {
  chatPath,
  claudeCodePath,
  docsPath,
  manifestoPath,
  mcpGuidePath,
} from "./paths.ts";
import { useClearViewportStyles } from "./useClearViewportStyles.ts";

hljs.registerLanguage("typescript", typescript);

const codeExample =
  `import { createIdentity, createConversation, sendMessage, setWebhook } from "@alice-and-bot/core";

// create two identities (works in browser or server)
const alice = await createIdentity("Alice", "alice");
const bot = await createIdentity("My Bot", "my_bot");

// start a conversation
const { conversationId } = await createConversation(
  [alice.publicSignKey, bot.publicSignKey],
  "Hello",
);

// send a message
await sendMessage({
  credentials: alice,
  conversation: conversationId,
  message: { type: "text", text: "Hey bot!" },
});

// receive messages via webhook
await setWebhook({ url: "https://my-server.com/hook", credentials: bot });`;

const highlightedCode = hljs.highlight(codeExample, { language: "typescript" })
  .value;

const featureCardClass =
  "flex flex-col p-8 bg-white/90 dark:bg-blue-950/80 rounded-2xl border border-blue-100 dark:border-blue-900 shadow-xl hover:scale-105 hover:shadow-2xl transition-transform duration-200 ease-out";

const FeatureCard = ({
  title,
  description,
}: {
  title: string;
  description: string;
}) => (
  <li class={featureCardClass}>
    <strong class="block text-blue-700 dark:text-blue-300 font-semibold text-xl mb-2">
      {title}
    </strong>
    <div class="text-gray-700 dark:text-gray-200 text-base">{description}</div>
  </li>
);

const FeatureGrid = ({
  items,
}: {
  items: { title: string; description: string }[];
}) => (
  <ul class="grid grid-cols-1 md:grid-cols-3 gap-8 w-full mb-8">
    {items.map(({ title, description }, i) => (
      <FeatureCard key={i} title={title} description={description} />
    ))}
  </ul>
);

const sectionClass = "w-full max-w-6xl px-4 flex flex-col items-center mb-16";

const sectionHeadingClass = "text-3xl font-bold mb-3 text-center";

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
      "Each account can set a price for being contacted. Approve trusted identities for free. No more endless spam, no more captchas.",
  },
];

const aiFeatures = [
  {
    title: "Bot-First Design",
    description:
      "Create accounts for bots or AI agents without bureaucracy. No phone verification, no arbitrary restrictions.",
  },
  {
    title: "Unlimited Identities",
    description:
      "Spin up as many identities as your agents need. Each one is a lightweight key pair, ready in milliseconds.",
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
    title: "White Label & Embed Anywhere",
    description:
      "Integrate chat into your website or app. Bring anyone into a conversation, move seamlessly between devices, and enable supervision or observation as needed.",
  },
  {
    title: "Browser & Server",
    description:
      "All functions work in both browser and server environments. Build from wherever you are.",
  },
];

export const LandingPage = () => {
  useClearViewportStyles();

  return (
    <main class="text-blue-800 dark:text-blue-200 min-h-screen w-full flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-100 dark:from-gray-900 dark:via-gray-950 dark:to-blue-950 px-0 py-0">
      <header class="w-full py-16 flex flex-col items-center justify-center bg-gradient-to-r from-blue-600 via-blue-500 to-blue-400 dark:from-blue-900 dark:via-blue-800 dark:to-blue-700 shadow-lg mb-12">
        <img src="icon.png" alt="Alice&Bot logo" style={{ width: 384 }} />
        <h1 class="text-6xl md:text-7xl font-extrabold tracking-tight text-white drop-shadow-lg mb-4">
          Alice&Bot
        </h1>
        <p class="text-xl md:text-2xl text-blue-100 font-medium max-w-2xl text-center mb-2">
          Let's unbreak chat.
        </p>
        <p class="text-lg text-blue-200 max-w-2xl text-center">
          The developer-first, privacy-first chat platform for bots and humans.
          No phone numbers. No bureaucracy. Just open, programmable, secure
          communication.
        </p>
      </header>
      <section class="w-full max-w-4xl px-4 flex flex-col items-center mb-12">
        <h3 class="text-2xl font-bold mb-4 text-center">
          Philosophy
        </h3>
        <p class="text-lg text-gray-700 dark:text-gray-300 text-center mb-6">
          We believe chat should be open, programmable, and privacy-respecting.
          End-to-end encryption and seamless device transition are
          non-negotiable. Spam is solved by user-set pricing, not by captchas or
          bureaucracy. Alice&Bot is for developers, businesses, and anyone who
          wants to build the future of communication.
        </p>
      </section>
      <section class={sectionClass}>
        <h2 class={sectionHeadingClass}>For Humans</h2>
        <p class="text-lg text-gray-700 dark:text-gray-300 text-center mb-8">
          Private, spam-free messaging you control.
        </p>
        <FeatureGrid items={humanFeatures} />
        <h3 class="text-2xl font-bold mb-6 text-center">
          Install on your phone
        </h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
          <div class="flex flex-col items-center p-6 bg-white/90 dark:bg-blue-950/80 rounded-2xl border border-blue-100 dark:border-blue-900 shadow-xl">
            <FaAndroid size={40} className="text-green-500 mb-3" />
            <strong class="text-lg font-semibold text-blue-700 dark:text-blue-300 mb-2">
              Android
            </strong>
            <ol class="text-gray-700 dark:text-gray-200 text-sm space-y-1 list-decimal list-inside">
              <li>
                Open{" "}
                <a
                  href={chatPath}
                  class="underline text-blue-600 dark:text-blue-400"
                >
                  aliceandbot.com/chat
                </a>{" "}
                in Chrome
              </li>
              <li>Tap the menu (three dots)</li>
              <li>Tap "Add to Home screen"</li>
            </ol>
          </div>
          <div class="flex flex-col items-center p-6 bg-white/90 dark:bg-blue-950/80 rounded-2xl border border-blue-100 dark:border-blue-900 shadow-xl">
            <FaApple
              size={40}
              className="text-gray-700 dark:text-gray-300 mb-3"
            />
            <strong class="text-lg font-semibold text-blue-700 dark:text-blue-300 mb-2">
              iPhone / iPad
            </strong>
            <ol class="text-gray-700 dark:text-gray-200 text-sm space-y-1 list-decimal list-inside">
              <li>
                Open{" "}
                <a
                  href={chatPath}
                  class="underline text-blue-600 dark:text-blue-400"
                >
                  aliceandbot.com/chat
                </a>{" "}
                in Safari
              </li>
              <li>Tap the share button</li>
              <li>Tap "Add to Home Screen"</li>
            </ol>
          </div>
        </div>
      </section>
      <section class={sectionClass}>
        <h2 class={sectionHeadingClass}>For AIs</h2>
        <p class="text-lg text-gray-700 dark:text-gray-300 text-center mb-8">
          First-class support for bots and AI agents.
        </p>
        <FeatureGrid items={aiFeatures} />
        <div class="w-full max-w-4xl flex flex-col items-center">
          <h3 class="text-2xl font-bold mb-4 text-center">
            AI Agent Skill
          </h3>
          <p class="text-lg text-gray-700 dark:text-gray-300 text-center mb-4">
            Give your AI coding agent the ability to build bots on Alice&Bot.
            Install the skill and your agent will know how to create identities,
            send messages, set up webhooks, and more.
          </p>
          <pre class="w-full bg-gray-900 text-green-400 rounded-xl p-4 text-sm overflow-x-auto shadow-lg mb-2">
            <code>
              {`mkdir -p ~/.agents/skills/alice-and-bot
curl -o ~/.agents/skills/alice-and-bot/SKILL.md \\
  https://raw.githubusercontent.com/uriva/alice-and-bot/main/skill/SKILL.md`}
            </code>
          </pre>
          <p class="text-sm text-gray-500 dark:text-gray-400 text-center">
            Works with any agent that supports{" "}
            <a
              href="https://github.com/anomalyco/opencode"
              class="underline text-blue-600 dark:text-blue-400"
            >
              OpenCode
            </a>-style skills.
          </p>
        </div>
      </section>
      <section class={sectionClass}>
        <h2 class={sectionHeadingClass}>For AI Code Editors</h2>
        <p class="text-lg text-gray-700 dark:text-gray-300 text-center mb-8">
          Chat with your coding sessions from your phone.
        </p>
        <FeatureGrid
          items={[
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
          ]}
        />
        <div class="flex flex-wrap justify-center gap-4">
          <a
            href={mcpGuidePath}
            class="px-8 py-4 bg-gradient-to-r from-blue-500 to-blue-700 dark:from-blue-600 dark:to-blue-800 text-white text-lg font-bold rounded-full shadow-lg hover:opacity-90 transition"
          >
            Setup Guide
          </a>
          <a
            href={claudeCodePath}
            class="px-8 py-4 bg-gradient-to-r from-blue-400 to-blue-600 dark:from-blue-700 dark:to-blue-900 text-white text-lg font-bold rounded-full shadow-lg hover:opacity-90 transition"
          >
            Claude Code Guide
          </a>
        </div>
      </section>
      <section class={sectionClass}>
        <p class="text-lg text-gray-700 dark:text-gray-300 text-center mb-8">
          Programmable chat with full API access.
        </p>
        <FeatureGrid items={developerFeatures} />
        <pre class="w-full max-w-4xl bg-gray-900 rounded-xl p-4 text-sm overflow-x-auto shadow-lg mb-2">
          <code
            class="hljs language-typescript"
            dangerouslySetInnerHTML={{ __html: highlightedCode }}
          />
        </pre>
        <p class="text-sm text-gray-500 dark:text-gray-400 text-center mt-2 mb-4">
          All functions work in both browser and server environments.
        </p>
      </section>
      <div class="flex flex-wrap justify-center mb-12 gap-4">
        <a
          type="button"
          href="https://github.com/uriva/alice-and-bot"
          class="px-8 py-4 bg-gradient-to-r from-blue-400 to-blue-600 dark:from-blue-700 dark:to-blue-900 text-white text-xl font-bold rounded-full shadow-lg opacity-70 hover:opacity-80 transition"
        >
          <FaGithub size={28} />
        </a>
        <a
          type="button"
          href={chatPath}
          class="px-8 py-4 bg-gradient-to-r from-blue-400 to-blue-600 dark:from-blue-700 dark:to-blue-900 text-white text-xl font-bold rounded-full shadow-lg opacity-70 hover:opacity-80 transition"
        >
          Messenger app
        </a>
        <a
          type="button"
          href={docsPath}
          class="px-8 py-4 bg-gradient-to-r from-blue-400 to-blue-600 dark:from-blue-700 dark:to-blue-900 text-white text-xl font-bold rounded-full shadow-lg opacity-70 hover:opacity-80 transition"
        >
          Docs
        </a>
        <a
          type="button"
          href={manifestoPath}
          class="px-8 py-4 bg-gradient-to-r from-blue-400 to-blue-600 dark:from-blue-700 dark:to-blue-900 text-white text-xl font-bold rounded-full shadow-lg opacity-70 hover:opacity-80 transition"
        >
          Our Manifesto
        </a>
      </div>
      <footer class="w-full bg-gradient-to-r from-blue-900 dark:from-gray-950 to-blue-800 dark:to-gray-900 border-t border-blue-700 dark:border-gray-700 mt-16">
        <div class="max-w-6xl mx-auto px-4 py-12 flex flex-col items-center gap-8">
          <div class="text-center">
            <p class="text-lg font-semibold text-white mb-2">
              Alice&Bot. Chat for the AI era.
            </p>
            <p class="text-sm text-blue-100 dark:text-gray-300">
              The developer-first, privacy-first chat platform
            </p>
          </div>
          <nav class="flex flex-wrap justify-center gap-6">
            <a
              href={docsPath}
              class="text-blue-100 dark:text-gray-300 hover:text-white transition font-medium"
            >
              Docs
            </a>
            <a
              href={manifestoPath}
              class="text-blue-100 dark:text-gray-300 hover:text-white transition font-medium"
            >
              Manifesto
            </a>
            <a
              href="https://github.com/uriva/alice-and-bot"
              target="_blank"
              rel="noopener noreferrer"
              class="text-blue-100 dark:text-gray-300 hover:text-white transition font-medium"
            >
              GitHub
            </a>
            <a
              href="https://discord.gg/xkGMFH9RAz"
              target="_blank"
              rel="noopener noreferrer"
              class="text-blue-100 dark:text-gray-300 hover:text-white transition font-medium"
            >
              Discord
            </a>
            <a
              href={mcpGuidePath}
              class="text-blue-100 dark:text-gray-300 hover:text-white transition font-medium"
            >
              MCP Guide
            </a>
            <a
              href={claudeCodePath}
              class="text-blue-100 dark:text-gray-300 hover:text-white transition font-medium"
            >
              Claude Code
            </a>
          </nav>
          <div class="border-t border-blue-700 dark:border-gray-700 w-full pt-6 text-center text-sm text-blue-100 dark:text-gray-400">
            &copy; {new Date().getFullYear()} Alice&Bot. All rights reserved.
          </div>
        </div>
      </footer>
    </main>
  );
};
