import { useLocation } from "preact-iso/router";
import { Button } from "./components.tsx";
import { chatPath } from "./paths.ts";

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
  const route = useLocation().route;
  return (
    <main class="min-h-screen w-full flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-100 dark:from-gray-900 dark:via-gray-950 dark:to-blue-950 px-0 py-0">
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
        <h2 class="text-3xl font-bold mb-8 text-blue-800 dark:text-blue-200 text-center">
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
        <h3 class="text-2xl font-bold mb-4 text-blue-800 dark:text-blue-200 text-center">
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
        <h3 class="text-2xl font-bold mb-4 text-blue-800 dark:text-blue-200 text-center">
          For Developers
        </h3>
        <ul class="list-disc list-inside text-lg text-gray-700 dark:text-gray-200 space-y-2 text-center">
          <li>APIs and webhooks for full automation</li>
          <li>Cloud storage for device independence</li>
          <li>Bring your own identity (public/private key)</li>
          <li>White label and embed anywhere</li>
        </ul>
      </section>
      <div class="flex justify-center mb-12">
        <button
          type="button"
          disabled
          class="px-8 py-4 bg-gradient-to-r from-blue-400 to-blue-600 dark:from-blue-700 dark:to-blue-900 text-white text-xl font-bold rounded-full shadow-lg cursor-not-allowed opacity-70 hover:opacity-80 transition"
        >
          Get Early Access (Coming Soon)
        </button>
      </div>
      <footer class="w-full text-center text-gray-400 dark:text-gray-500 text-base py-8 mt-auto">
        &copy; {new Date().getFullYear()}{" "}
        Alice&Bot. Built for the next era of chat.
      </footer>
      <Button
        onClick={() => {
          route(chatPath);
        }}
      >
        Start chatting!
      </Button>
    </main>
  );
};
