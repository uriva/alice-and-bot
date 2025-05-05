import { render } from "preact";
import { TryIt } from "./tryIt.tsx";

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

const LandingPage = () => {
  return (
    <main class="container mx-auto max-w-2xl px-4 py-8 text-gray-900 bg-white rounded-lg shadow-lg">
      <header class="mb-8 text-center">
        <h1 class="text-4xl font-extrabold tracking-tight text-blue-700 mb-2">
          Alice&Bot
        </h1>
      </header>
      <article class="mb-8">
        <h2 class="text-2xl font-bold mb-2 text-gray-800">
          Let's unbreak Chat in 2025
        </h2>
        <p class="text-gray-600">
          It’s time to kill WhatsApp by building a chat platform for bots and
          humans, not tied to a phone number, and designed for easy white
          labeling. Alice&Bot is the developer-first, privacy-first chat
          solution for the age of AI.
        </p>
      </article>
      <h2 class="text-xl font-semibold mb-4 text-gray-800">
        What’s missing from chat today?
      </h2>
      <ul class="grid gap-6 mb-8">
        {features.map((f, i) => (
          <li
            key={i}
            class="p-4 bg-blue-50 rounded-lg border border-blue-100 shadow-sm"
          >
            <strong class="block text-blue-700 font-semibold mb-1">
              {f.title}
            </strong>
            <div class="text-gray-700 text-sm">{f.description}</div>
          </li>
        ))}
      </ul>
      <article class="mb-8">
        <h3 class="text-lg font-bold mb-2 text-gray-800">Philosophy</h3>
        <p class="text-gray-600">
          We believe chat should be open, programmable, and privacy-respecting.
          End-to-end encryption and seamless device transition are
          non-negotiable. Spam is solved by user-set pricing, not by captchas or
          bureaucracy. Alice&Bot is for developers, businesses, and anyone who
          wants to build the future of communication.
        </p>
      </article>
      <article class="mb-8">
        <h3 class="text-lg font-bold mb-2 text-gray-800">For Developers</h3>
        <ul class="list-disc list-inside text-gray-700 space-y-1">
          <li>APIs and webhooks for full automation</li>
          <li>Cloud storage for device independence</li>
          <li>Bring your own identity (public/private key)</li>
          <li>White label and embed anywhere</li>
        </ul>
      </article>
      <div class="flex justify-center mb-8">
        <button
          type="button"
          disabled
          class="px-6 py-3 bg-blue-300 text-white font-semibold rounded-lg shadow cursor-not-allowed opacity-70"
        >
          Get Early Access (Coming Soon)
        </button>
      </div>
      <footer class="text-center text-gray-400 text-sm mt-8">
        &copy; {new Date().getFullYear()}{" "}
        Alice&Bot. Built for the next era of chat.
      </footer>
      <TryIt />
    </main>
  );
};

render(<LandingPage />, document.getElementById("root")!);
