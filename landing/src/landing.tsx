import { FaAndroid, FaApple, FaGithub } from "react-icons/fa";
import { chatPath, docsPath, manifestoPath } from "./paths.ts";
import { useClearViewportStyles } from "./useClearViewportStyles.ts";

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

const features = [
  {
    title: "Unlimited, Unlinked Identities",
    description:
      "Create and manage as many identities as you want, with no phone or email required. Perfect for business, privacy, and creative use cases.",
  },
  {
    title: "Bot-First, Human-Ready",
    description:
      "Easily create accounts for bots or nonhumans. Build AI-powered chat experiences without bureaucracy or arbitrary restrictions.",
  },
  {
    title: "White Label & Embed Anywhere",
    description:
      "Integrate chat into your website or app. Bring anyone into a conversation, move seamlessly between devices, and enable supervision or observation as needed.",
  },
  {
    title: "APIs & Webhooks by Default",
    description:
      "Send and receive messages via API and webhooks. No extra cost, no friction. Cloud storage is built in for device independence.",
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
      <section class="w-full max-w-6xl px-4 flex flex-col items-center">
        <h2 class="text-3xl font-bold mb-8 text-center">
          Everything missing from chat today
        </h2>
        <ul class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 w-full mb-12">
          {features.map((f, i) => (
            <li
              key={i}
              class="flex flex-col p-8 bg-white/90 dark:bg-blue-950/80 rounded-2xl border border-blue-100 dark:border-blue-900 shadow-xl hover:scale-105 hover:shadow-2xl transition-transform duration-200 ease-out"
            >
              <strong class="block text-blue-700 dark:text-blue-300 font-semibold text-xl mb-2">
                {f.title}
              </strong>
              <div class="text-gray-700 dark:text-gray-200 text-base">
                {f.description}
              </div>
            </li>
          ))}
        </ul>
      </section>
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
      <section class="w-full max-w-4xl px-4 flex flex-col items-center mb-12">
        <h3 class="text-2xl font-bold mb-4">
          For Developers
        </h3>
        <ul class="list-disc list-inside text-lg text-gray-700 dark:text-gray-200 space-y-2 text-center">
          <li>APIs and webhooks for full automation</li>
          <li>Cloud storage for device independence</li>
          <li>Bring your own identity (public/private key)</li>
          <li>White label and embed anywhere</li>
        </ul>
        <pre class="w-full bg-gray-900 text-green-400 rounded-xl p-4 text-sm overflow-x-auto shadow-lg mb-2">
          <code>{codeExample}</code>
        </pre>
        <p class="text-sm text-gray-500 dark:text-gray-400 text-center mt-2 mb-4">
          All functions work in both browser and server environments.
        </p>
      </section>
      <section class="w-full max-w-4xl px-4 flex flex-col items-center mb-12">
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
      </section>
      <section class="w-full max-w-4xl px-4 flex flex-col items-center mb-12">
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
              href={docsPath}
              class="text-blue-100 dark:text-gray-300 hover:text-white transition font-medium"
            >
              API Docs
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
