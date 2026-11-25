import { map } from "@uri/gamla";
import { html, type TemplateResult } from "lit";
import { useClearViewportStyles } from "./clear-viewport-styles.ts";
import { header } from "./header.ts";
import { homePath, legalPath, privacyPath, termsPath } from "./paths.ts";

const lastUpdated = "November 25, 2026";
const repoUrl = "https://github.com/uriva/alice-and-bot";
const operatorUrl = "https://uriv.me";

type LegalPageId = "legal" | "privacy" | "terms";

const pageMainClass =
  "min-h-screen w-full bg-[#f6f4ee] dark:bg-[#0c0c0b] text-[#181715] dark:text-[#f3f1ea] py-10 sm:py-14 px-4";
const containerClass = "max-w-4xl mx-auto flex flex-col gap-6";
const cardClass =
  "bg-white dark:bg-[#151513] border border-[#e7e4dc] dark:border-[#252420] rounded-2xl p-6 sm:p-10 shadow-[0_1px_2px_rgba(24,23,21,0.04)]";
const navPillBarClass =
  "inline-flex flex-wrap items-center gap-1 p-1 rounded-full bg-[#eae7de]/80 dark:bg-[#1a1916] border border-[#e2ded3] dark:border-[#262521] self-start";
const navPillClass = (active: boolean) =>
  `px-4 py-1.5 text-sm rounded-full transition-colors ${
    active
      ? "bg-[#181715] text-[#faf9f5] dark:bg-[#f3f1ea] dark:text-[#181715] font-semibold"
      : "text-[#66625b] dark:text-[#9c968c] hover:text-[#181715] dark:hover:text-[#f3f1ea] font-medium"
  }`;
const h1Class =
  "text-3xl sm:text-4xl font-extrabold tracking-[-0.03em] text-[#181715] dark:text-[#f3f1ea] mb-3";
const h2Class =
  "text-xl sm:text-2xl font-bold tracking-tight text-[#181715] dark:text-[#f3f1ea] mt-10 mb-3 pt-6 border-t border-[#ece8df] dark:border-[#24231f] first:mt-0 first:pt-0 first:border-t-0";
const h3Class =
  "text-base sm:text-lg font-semibold text-[#181715] dark:text-[#f3f1ea] mt-5 mb-2";
const pClass =
  "text-sm sm:text-[15px] text-[#4a4740] dark:text-[#b8b2a7] leading-relaxed mb-3.5";
const ulClass =
  "list-disc pl-5 space-y-2 text-sm sm:text-[15px] text-[#4a4740] dark:text-[#b8b2a7] leading-relaxed mb-4";
const strongClass = "font-semibold text-[#181715] dark:text-[#f3f1ea]";
const linkClass =
  "underline decoration-[#b8b2a7] dark:decoration-[#57534e] underline-offset-2 text-[#181715] dark:text-[#f3f1ea] hover:text-[#39587f] dark:hover:text-[#7da2cf] transition-colors";
const codeClass =
  "font-mono text-xs sm:text-[13px] px-1.5 py-0.5 rounded bg-[#f2efe8] dark:bg-[#22211d] text-[#181715] dark:text-[#f3f1ea]";
const calloutClass =
  "rounded-xl border border-[#e3dfd4] dark:border-[#2a2924] bg-[#faf9f5] dark:bg-[#1a1916] p-4 sm:p-5 my-5";
const tableWrapClass =
  "w-full overflow-x-auto rounded-xl border border-[#e7e4dc] dark:border-[#252420] my-5";
const tableClass = "w-full text-left border-collapse text-sm";
const thClass =
  "py-3 px-4 font-semibold text-[#181715] dark:text-[#f3f1ea] bg-[#faf9f5] dark:bg-[#1a1916] border-b border-[#e7e4dc] dark:border-[#252420]";
const tdClass =
  "py-3 px-4 text-[#4a4740] dark:text-[#b8b2a7] border-t border-[#ece8df] dark:border-[#24231f] align-top leading-relaxed";
const overviewCardClass =
  "flex flex-col justify-between p-6 rounded-2xl border border-[#e7e4dc] dark:border-[#252420] bg-[#faf9f5] dark:bg-[#191815] hover:border-[#cbc6b9] dark:hover:border-[#383630] transition-colors";

const contactLinks = () =>
  html`
    <a
      href="${operatorUrl}"
      target="_blank"
      rel="noopener noreferrer"
      class="${linkClass}"
    >uriv.me</a> or the <a
      href="${repoUrl}"
      target="_blank"
      rel="noopener noreferrer"
      class="${linkClass}"
    >GitHub repository</a>
  `;

const legalNavItems: { id: LegalPageId; href: string; label: string }[] = [
  { id: "legal", href: legalPath, label: "Legal Overview" },
  { id: "privacy", href: privacyPath, label: "Privacy Policy" },
  { id: "terms", href: termsPath, label: "Terms of Service" },
];

const renderNavPill =
  (active: LegalPageId) =>
  ({ id, href, label }: { id: LegalPageId; href: string; label: string }) =>
    html`
      <a href="${href}" class="${navPillClass(active === id)}">${label}</a>
    `;

const legalShell = (
  active: LegalPageId,
  title: string,
  subtitle: string,
  body: TemplateResult,
): TemplateResult => {
  useClearViewportStyles();
  return html`
    ${header()}
    <main class="${pageMainClass}">
      <div class="${containerClass}">
        <nav aria-label="Legal navigation" class="${navPillBarClass}">
          ${map(renderNavPill(active))(legalNavItems)}
        </nav>

        <article class="${cardClass}">
          <header class="mb-8">
            <div
              class="inline-flex items-center gap-2 text-xs font-mono text-[#78736a] dark:text-[#8c867c] mb-3"
            >
              <span>Alice&amp;Bot</span>
              <span>·</span>
              <span>Last updated ${lastUpdated}</span>
            </div>
            <h1 class="${h1Class}">${title}</h1>
            <p class="${pClass} mb-0">${subtitle}</p>
          </header>

          ${body}

          <footer
            class="mt-10 pt-6 border-t border-[#ece8df] dark:border-[#24231f] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#78736a] dark:text-[#8c867c]"
          >
            <div>
              Questions? Contact the operator via ${contactLinks()}
            </div>
            <div class="flex flex-wrap gap-4">
              <a href="${homePath}" class="${linkClass}">Home</a>
              <a href="${legalPath}" class="${linkClass}">Overview</a>
              <a href="${privacyPath}" class="${linkClass}">Privacy Policy</a>
              <a href="${termsPath}" class="${linkClass}">Terms of Service</a>
            </div>
          </footer>
        </article>
      </div>
    </main>
  `;
};

type EncryptionRow = {
  category: string;
  status: string;
  details: string;
};

const encryptionMatrix: EncryptionRow[] = [
  {
    category: "Standard chat messages & edits",
    status: "End-to-end encrypted",
    details:
      "Message text, edits, reactions, and structured payloads are encrypted client-side with a per-conversation symmetric key before leaving your device.",
  },
  {
    category: "Attachment file contents",
    status: "End-to-end encrypted",
    details:
      "Images, voice notes, video, and files are encrypted on-device before upload to Google Cloud Storage; storage holds ciphertext blobs.",
  },
  {
    category: "Canvases & canvas events",
    status: "End-to-end encrypted",
    details:
      "Collaborative canvas state and canvas event payloads are encrypted end-to-end within the conversation.",
  },
  {
    category: "Device-transfer QR payloads",
    status: "End-to-end encrypted",
    details:
      "One-time credential transfer payloads are encrypted with a secret key carried only in the QR code / URL fragment and expire after 5 minutes.",
  },
  {
    category: "Conversation symmetric keys",
    status: "End-to-end encrypted",
    details:
      "Per-conversation keys are wrapped (encrypted) individually for each participant's public encryption key.",
  },
  {
    category: 'Live-streamed bot replies (POST /ui-update, type: "stream")',
    status: "NOT end-to-end encrypted",
    details:
      "Ephemeral streaming text chunks sent by bots/agents while generating responses travel in plaintext through our real-time infrastructure.",
  },
  {
    category: "Transient UI elements (spinner / progress)",
    status: "NOT end-to-end encrypted",
    details:
      "Status labels, spinner indicators, and progress bars sent via POST /ui-update are transmitted and synced in plaintext.",
  },
  {
    category: "Conversation titles, participant lists, typing & push metadata",
    status: "NOT end-to-end encrypted",
    details:
      "Conversation titles, member public keys, timestamps, ciphertext sizes, typing indicators, and Web Push routing metadata are visible to our servers to route messages.",
  },
  {
    category: "Public identity profiles & presence",
    status: "Public / NOT encrypted",
    details:
      "Display name, avatar, @alias handle, public signing and encryption keys, Paid Inbox priceTag, and real-time lastActiveAt (updated approximately every 30 seconds while active) are public.",
  },
  {
    category: "Bridged voice calls (voice.prompt2bot.com)",
    status: "NOT end-to-end encrypted",
    details:
      "Calls routed through the Voice Bridge at voice.prompt2bot.com are decoded to raw PCM audio on the bridge for AI/bot or Twilio telephony bridging.",
  },
  {
    category: "Location map tiles (CARTO / Google Maps)",
    status: "Plaintext coordinates to map tile host",
    details:
      "Location messages are E2E encrypted in transit/storage, but viewing a location sends decrypted map tile coordinates from your browser to basemaps.cartocdn.com (and opening external links sends coordinates to Google Maps).",
  },
  {
    category: "Messages decrypted by bots, AI agents, or MCP clients",
    status: "Plaintext after participant decryption",
    details:
      "Any bot, webhook, AI agent, or MCP client in a conversation decrypts messages with its own private key and may store or forward them to external LLM APIs under its own policies.",
  },
];

const renderEncryptionRow = ({ category, status, details }: EncryptionRow) =>
  html`
    <tr>
      <td class="${tdClass} ${strongClass}">${category}</td>
      <td class="${tdClass} font-mono text-xs whitespace-nowrap">${status}</td>
      <td class="${tdClass}">${details}</td>
    </tr>
  `;

type SubprocessorRow = {
  provider: string;
  role: string;
  dataProcessed: string;
};

const subprocessors: SubprocessorRow[] = [
  {
    provider: "Cloudflare (Workers & Durable Objects, US)",
    role: "API hosting, edge routing & ephemeral coordination",
    dataProcessed:
      "API requests to api.aliceandbot.com, IP addresses, signed payloads, ciphertext, ephemeral queues, and authentication nonces.",
  },
  {
    provider: "InstantDB",
    role: "Real-time database & synchronization",
    dataProcessed:
      "Encrypted messages, conversation metadata (titles, participant keys), public profiles (including lastActiveAt), typing indicators, and plaintext ephemeral UI updates.",
  },
  {
    provider: "Google Cloud Storage",
    role: "Attachment object storage",
    dataProcessed:
      "Client-side encrypted attachment ciphertext blobs and blob metadata.",
  },
  {
    provider: "Google Cloud Compute Engine & TURN/STUN",
    role: "Voice relay & WebRTC NAT traversal",
    dataProcessed:
      "IP addresses, connection metadata, and relayed media packets for voice calls.",
  },
  {
    provider: "PostHog (US)",
    role: "Cookie-less marketing/docs analytics only",
    dataProcessed:
      "Aggregate pageview analytics on marketing and documentation pages only (memory-only persistence, autocapture disabled, session recording disabled). Never initialized on /chat routes.",
  },
  {
    provider: "Anomalisa",
    role: "Client-side error tracking",
    dataProcessed:
      "Client error event names, stack traces, and basic browser/runtime diagnostics.",
  },
  {
    provider: "Google Fonts",
    role: "Web font delivery",
    dataProcessed:
      "Standard HTTP request headers (such as IP address and User-Agent) when loading Plus Jakarta Sans and JetBrains Mono fonts.",
  },
  {
    provider:
      "Browser Web Push Providers (Google FCM, Apple APNs, Mozilla Autopush)",
    role: "Push notification delivery",
    dataProcessed:
      "Push subscription endpoints and encrypted push payloads routed to wake subscribed browsers/devices.",
  },
  {
    provider: "CARTO (basemaps.cartocdn.com) & Google Maps",
    role: "Location map rendering & external map links",
    dataProcessed:
      "Decrypted map tile coordinates requested by your browser when viewing a location attachment, and coordinates passed if you click through to Google Maps.",
  },
  {
    provider: "QRServer",
    role: "Bitcoin deposit QR image rendering",
    dataProcessed:
      "Bitcoin deposit URI/address encoded into a QR code image when initiating a Paid Inbox deposit.",
  },
  {
    provider: "CoinGecko & Mempool.space",
    role: "Bitcoin pricing & on-chain verification",
    dataProcessed:
      "BTC/USD spot rate lookups (CoinGecko) and public Bitcoin deposit address transaction status checks (Mempool.space).",
  },
  {
    provider: "Twilio & Voice Bridge (voice.prompt2bot.com)",
    role: "AI/bot and telephony voice call bridging",
    dataProcessed:
      "Call signaling and decoded PCM voice audio for calls routed through the Voice Bridge or telephony integrations.",
  },
  {
    provider: "User-Configured Bot Webhooks",
    role: "Third-party bot delivery",
    dataProcessed:
      "Encrypted message envelopes and event metadata POSTed to external URLs configured by bot/identity owners.",
  },
];

const renderSubprocessorRow = ({
  provider,
  role,
  dataProcessed,
}: SubprocessorRow) =>
  html`
    <tr>
      <td class="${tdClass} ${strongClass}">${provider}</td>
      <td class="${tdClass}">${role}</td>
      <td class="${tdClass}">${dataProcessed}</td>
    </tr>
  `;

export const legal = (): TemplateResult =>
  legalShell(
    "legal",
    "Legal Overview",
    "Plain-language guide to how Alice&Bot handles your data, cryptographic keys, open-source licensing, and hosted service terms.",
    html`
      <div class="grid grid-cols-1 md:grid-cols-2 gap-5 my-2">
        <div class="${overviewCardClass}">
          <div>
            <h2 class="text-lg font-bold text-[#181715] dark:text-[#f3f1ea] mb-2">
              Privacy Policy
            </h2>
            <p class="${pClass}">
              Exact technical breakdown of what is end-to-end encrypted versus
              what is plaintext (including live bot streams, metadata, public
              profiles, bridged voice calls, map tiles, and third-party AI
              agents), all subprocessors, browser storage, retention, and
              GDPR/CCPA rights.
            </p>
          </div>
          <a
            href="${privacyPath}"
            class="inline-flex items-center text-sm font-semibold text-[#181715] dark:text-[#f3f1ea] underline underline-offset-4 mt-2"
          >Read Privacy Policy →</a>
        </div>

        <div class="${overviewCardClass}">
          <div>
            <h2 class="text-lg font-bold text-[#181715] dark:text-[#f3f1ea] mb-2">
              Terms of Service
            </h2>
            <p class="${pClass}">
              Rules for the hosted service at <span class="${codeClass}">aliceandbot.com</span>
              and <span class="${codeClass}">api.aliceandbot.com</span>, the
              boundary with our MIT-licensed open-source code, self-custody of
              private keys, Paid Inbox &amp; Bitcoin deposits, embeddable widget
              obligations, and governing law.
            </p>
          </div>
          <a
            href="${termsPath}"
            class="inline-flex items-center text-sm font-semibold text-[#181715] dark:text-[#f3f1ea] underline underline-offset-4 mt-2"
          >Read Terms of Service →</a>
        </div>
      </div>

      <section>
        <h2 class="${h2Class}">Key Facts at a Glance</h2>
        <ul class="${ulClass}">
          <li>
            <span class="${strongClass}">Open-Source Code vs. Hosted Service:</span>
            The Alice&amp;Bot codebase is open source under the
            <a
              href="https://github.com/uriva/alice-and-bot"
              target="_blank"
              rel="noopener noreferrer"
              class="${linkClass}"
            >MIT License</a>. Our Terms of Service and Privacy Policy govern the
            hosted service at <span class="${codeClass}">https://aliceandbot.com</span>
            and <span class="${codeClass}">https://api.aliceandbot.com</span>.
            Self-hosted deployments are solely the responsibility of their
            operators.
          </li>
          <li>
            <span class="${strongClass}">Honest Encryption Scope:</span>
            Standard chat messages, file attachments, canvases, device-transfer
            QR payloads, and conversation symmetric keys are end-to-end
            encrypted. Live-streamed bot updates
            (<span class="${codeClass}">POST /ui-update</span>), transient UI
            spinners/progress bars, conversation metadata, public profiles
            (including <span class="${codeClass}">lastActiveAt</span>), bridged
            voice audio (<span class="${codeClass}">voice.prompt2bot.com</span>),
            map tile coordinates, and content decrypted by third-party AI
            agents/MCP clients are <span class="${strongClass}">not</span>
            end-to-end encrypted.
          </li>
          <li>
            <span class="${strongClass}">No Analytics in Chat:</span>
            We do not initialize PostHog on <span class="${codeClass}">/chat</span>
            routes. On marketing and documentation pages, PostHog runs
            cookie-less in memory only, with autocapture and session recording
            disabled.
          </li>
          <li>
            <span class="${strongClass}">Self-Custody Keys &amp; 18+ Only:</span>
            Private keys never leave your device and cannot be recovered by us.
            The hosted service is for users 18 years or older and is governed by
            the laws of the State of New Mexico, United States.
          </li>
        </ul>
      </section>
    `,
  );

export const privacy = (): TemplateResult =>
  legalShell(
    "privacy",
    "Privacy Policy",
    "This Privacy Policy explains what data Alice&Bot collects, what is end-to-end encrypted, what is not encrypted, which third-party services we use, and what rights you have when using https://aliceandbot.com and https://api.aliceandbot.com.",
    html`
      <section>
        <h2 class="${h2Class}">1. Scope &amp; Open-Source Distinction</h2>
        <p class="${pClass}">
          This Privacy Policy applies to the hosted Alice&amp;Bot web messenger,
          marketing and documentation site (<span class="${codeClass}">https://aliceandbot.com</span>),
          hosted API (<span class="${codeClass}">https://api.aliceandbot.com</span>),
          and the hosted embeddable chat widget operated by Alice&amp;Bot.
        </p>
        <p class="${pClass}">
          The Alice&amp;Bot software is open source under the
          <span class="${strongClass}">MIT License</span>. If you connect to a
          self-hosted Alice&amp;Bot server operated by someone else, or interact
          with the widget embedded on a third-party website, that operator's own
          privacy practices apply independently.
        </p>
      </section>

      <section>
        <h2 class="${h2Class}">
          2. End-to-End Encryption vs. What Is NOT Encrypted
        </h2>
        <p class="${pClass}">
          We aim to be 100% technically transparent about where end-to-end
          encryption (E2EE) applies and where it does not.
        </p>

        <div class="${calloutClass}">
          <p class="${pClass} mb-2">
            <span class="${strongClass}">Summary:</span> Standard messages,
            attachment file contents, canvases, device-transfer QR payloads, and
            wrapped conversation symmetric keys are end-to-end encrypted.
            However, real-time bot streams, transient UI elements, conversation
            metadata, public profiles, bridged voice calls, map tile lookups,
            and anything decrypted by a participating bot, AI agent, or MCP
            client are <span class="${strongClass}">not</span> protected by
            end-to-end encryption.
          </p>
        </div>

        <div class="${tableWrapClass}">
          <table class="${tableClass}">
            <thead>
              <tr>
                <th class="${thClass}">Data Type</th>
                <th class="${thClass}">Encryption Status</th>
                <th class="${thClass}">Technical Reality</th>
              </tr>
            </thead>
            <tbody>
              ${map(renderEncryptionRow)(encryptionMatrix)}
            </tbody>
          </table>
        </div>

        <h3 class="${h3Class}">What IS End-to-End Encrypted</h3>
        <ul class="${ulClass}">
          <li>
            <span class="${strongClass}">Standard chat messages:</span> Text
            messages, message edits, reactions, and structured message bodies
            encrypted client-side with a conversation symmetric key before
            transmission.
          </li>
          <li>
            <span class="${strongClass}">Attachment file contents:</span> Images,
            voice recordings, videos, and other uploaded files encrypted on your
            device prior to upload to Google Cloud Storage.
          </li>
          <li>
            <span class="${strongClass}">Canvases:</span> Collaborative canvas
            events and payloads encrypted within the conversation.
          </li>
          <li>
            <span class="${strongClass}">Device-transfer QR payloads:</span>
            Temporary identity transfer payloads encrypted using a symmetric key
            passed solely in the QR code / URL fragment (never sent to the
            server in the payload request).
          </li>
          <li>
            <span class="${strongClass}">Conversation symmetric keys:</span>
            Encrypted separately for each participant's public encryption key so
            our servers cannot unwrap them.
          </li>
        </ul>

        <h3 class="${h3Class}">What Is NOT End-to-End Encrypted</h3>
        <ul class="${ulClass}">
          <li>
            <span class="${strongClass}">Live-streamed bot replies:</span>
            Incremental reply chunks pushed via
            <span class="${codeClass}">POST /ui-update</span> with
            <span class="${codeClass}">type: "stream"</span> are transmitted and
            synced in plaintext through our servers/InstantDB.
          </li>
          <li>
            <span class="${strongClass}">Transient UI elements:</span>
            Ephemeral <span class="${codeClass}">spinner</span> and
            <span class="${codeClass}">progress</span> updates sent via
            <span class="${codeClass}">POST /ui-update</span> (including their
            text labels and percentages) are not E2E encrypted.
          </li>
          <li>
            <span class="${strongClass}">Conversation &amp; routing metadata:</span>
            Conversation titles, participant lists (public keys), message
            timestamps, ciphertext sizes, typing indicators, and Web Push
            routing metadata (push subscription endpoints and delivery targets)
            are visible to our infrastructure.
          </li>
          <li>
            <span class="${strongClass}">Public identity profiles:</span>
            Your display <span class="${codeClass}">name</span>,
            <span class="${codeClass}">avatar</span>,
            <span class="${codeClass}">alias</span> (<span class="${codeClass}">@handle</span>),
            public signing and encryption keys, Paid Inbox
            <span class="${codeClass}">priceTag</span>, and real-time
            <span class="${codeClass}">lastActiveAt</span> heartbeat timestamp
            (updated roughly every 30 seconds while the app is active) are
            stored in plaintext and publicly queryable.
          </li>
          <li>
            <span class="${strongClass}">Bridged voice calls:</span>
            Voice calls routed through the Voice Bridge at
            <span class="${codeClass}">voice.prompt2bot.com</span> are decoded
            to raw PCM audio on the bridge so they can be connected to bots, AI
            models, or telephony networks (Twilio). Direct peer-to-peer WebRTC
            calls use standard DTLS-SRTP transport encryption and may route
            packets through TURN/STUN relays.
          </li>
          <li>
            <span class="${strongClass}">Location map tile requests:</span>
            While location coordinates are encrypted inside the message payload,
            rendering a location preview causes your browser to request map
            tiles from CARTO (<span class="${codeClass}">basemaps.cartocdn.com</span>)
            using the decrypted coordinates (zoom/x/y tiles). Clicking to open
            an external map sends the coordinates to Google Maps.
          </li>
          <li>
            <span class="${strongClass}">Third-party AI agents, bots &amp; MCP clients:</span>
            Any bot, webhook handler, AI agent, or Model Context Protocol (MCP)
            client you add to a conversation is an end-to-end participant with
            its own decryption key. Once that participant decrypts your
            messages, E2EE ends and that bot or MCP client may log, retain, or
            transmit plaintext content to external AI/LLM providers under its
            own terms and privacy policy.
          </li>
        </ul>
      </section>

      <section>
        <h2 class="${h2Class}">3. Subprocessors &amp; Third-Party Services</h2>
        <p class="${pClass}">
          To operate the hosted service, Alice&amp;Bot relies on the following
          infrastructure providers and third-party services:
        </p>
        <div class="${tableWrapClass}">
          <table class="${tableClass}">
            <thead>
              <tr>
                <th class="${thClass}">Service / Provider</th>
                <th class="${thClass}">Purpose</th>
                <th class="${thClass}">Data Processed</th>
              </tr>
            </thead>
            <tbody>
              ${map(renderSubprocessorRow)(subprocessors)}
            </tbody>
          </table>
        </div>
        <p class="${pClass}">
          <span class="${strongClass}">Analytics &amp; Cookies:</span> We do not
          set advertising or cross-site tracking cookies. PostHog is initialized
          <span class="${strongClass}">only</span> on marketing and
          documentation pages with
          <span class="${codeClass}">persistence: "memory"</span> (no tracking
          cookies or localStorage identifiers),
          <span class="${codeClass}">autocapture: false</span>, and
          <span class="${codeClass}">disable_session_recording: true</span>.
          PostHog is <span class="${strongClass}">never</span> initialized on
          <span class="${codeClass}">/chat</span> routes.
        </p>
      </section>

      <section>
        <h2 class="${h2Class}">4. Device Permissions &amp; Browser Storage</h2>
        <h3 class="${h3Class}">Device Permissions</h3>
        <p class="${pClass}">
          Alice&amp;Bot requests browser/device permissions only when you
          actively initiate a feature that requires them:
        </p>
        <ul class="${ulClass}">
          <li>
            <span class="${strongClass}">Microphone:</span> Used to record voice
            notes and participate in voice calls.
          </li>
          <li>
            <span class="${strongClass}">Camera:</span> Used to scan
            device-transfer QR codes and capture photos or media you choose to
            send.
          </li>
          <li>
            <span class="${strongClass}">Precise Geolocation:</span> Used only
            when you explicitly choose to share your current location in a chat.
          </li>
          <li>
            <span class="${strongClass}">Notifications:</span> Used to display
            Web Push notifications when you opt in.
          </li>
        </ul>

        <h3 class="${h3Class}">Browser Storage (localStorage &amp; IndexedDB)</h3>
        <ul class="${ulClass}">
          <li>
            <span class="${strongClass}"><span class="${codeClass}">localStorage</span>:</span>
            Stores your cryptographic identity credentials—including your
            <span class="${strongClass}">private signing and encryption keys</span>
            (e.g., <span class="${codeClass}">alicebot_credentials</span> in
            <span class="${codeClass}">/chat</span> and
            <span class="${codeClass}">aliceAndBotCredentials</span> in the
            embeddable widget)—along with cached conversation metadata, cached
            <span class="${strongClass}">decrypted message previews</span> for
            fast sidebar rendering, and your light/dark
            <span class="${codeClass}">theme</span> preference.
          </li>
          <li>
            <span class="${strongClass}"><span class="${codeClass}">IndexedDB</span>:</span>
            Stores <span class="${codeClass}">alicebot_push_store</span>
            (cryptographic keys used by the Service Worker to decrypt incoming
            Web Push notifications locally on your device) and InstantDB's local
            offline/sync cache.
          </li>
          <li>
            <span class="${strongClass}">Sign Out behavior:</span> Clicking
            <span class="${strongClass}">Sign Out</span> in Settings makes a
            best-effort request to unregister your browser's Web Push
            subscription from our server and push provider, removes your stored
            credentials and cached previews from
            <span class="${codeClass}">localStorage</span>, and clears
            <span class="${codeClass}">alicebot_push_store</span>. Anyone with
            physical or script access to an unlocked browser profile while you
            are signed in could access keys and cached previews stored locally.
          </li>
        </ul>
      </section>

      <section>
        <h2 class="${h2Class}">5. Retention, Deletion &amp; Data Portability</h2>
        <ul class="${ulClass}">
          <li>
            <span class="${strongClass}">Server retention:</span> Encrypted
            messages, encrypted attachments, conversation metadata, public
            identity profiles, and Paid Inbox wallet/transaction records stored
            on our hosted servers are retained
            <span class="${strongClass}">indefinitely</span> unless you request
            deletion.
          </li>
          <li>
            <span class="${strongClass}">Automatic expiration of ephemeral data:</span>
            Ephemeral delivery queues, authentication nonces, device-transfer QR
            payloads (5-minute TTL), typing indicators, and transient UI
            elements (<span class="${codeClass}">spinner</span>,
            <span class="${codeClass}">progress</span>, and stream buffers)
            expire automatically after short operational windows.
          </li>
          <li>
            <span class="${strongClass}">How to request deletion:</span> Contact
            the operator via ${contactLinks()} with your public signing key (or
            <span class="${codeClass}">@alias</span>) to request deletion of
            your hosted profile, server records, or encrypted attachments. Because Alice&amp;Bot does not collect email
            addresses or passwords, we may require a cryptographically signed
            challenge from your identity key to verify ownership. Deleting your
            account cannot delete copies of messages already delivered to other
            conversation participants or third-party bots, and we may retain
            minimal financial/anti-fraud records for Paid Inbox transactions
            where legally required.
          </li>
          <li>
            <span class="${strongClass}">Portability:</span> Your identity
            keypair is fully portable—you can copy your secret recovery key or
            transfer via QR code at any time and move to a self-hosted instance
            or another client. Please note that Alice&amp;Bot does
            <span class="${strongClass}">not</span> currently offer a one-click
            bulk server export UI for message history or attachments; you may
            programmatically read and export your decrypted history using your
            own keys and our open-source SDK.
          </li>
        </ul>
      </section>

      <section>
        <h2 class="${h2Class}">
          6. Your Privacy Rights (GDPR / UK GDPR &amp; CCPA / CPRA)
        </h2>
        <p class="${pClass}">
          Depending on your jurisdiction—including the European Economic Area
          (EEA), the United Kingdom, Switzerland, California, and other US
          states with comprehensive privacy laws—you may have the right to:
        </p>
        <ul class="${ulClass}">
          <li>Access and receive a copy of personal data we hold about you;</li>
          <li>Correct inaccurate profile metadata (most of which you can edit directly in Settings);</li>
          <li>Request deletion (erasure) of your server-side data;</li>
          <li>Restrict or object to certain processing activities;</li>
          <li>Withdraw consent where processing relies on consent (such as browser push notifications or device permissions);</li>
          <li>Receive non-discriminatory treatment when exercising your privacy rights; and</li>
          <li>Lodge a complaint with your local data protection supervisory authority.</li>
        </ul>
        <p class="${pClass}">
          <span class="${strongClass}">GDPR Legal Bases:</span> Where GDPR or UK
          GDPR applies, we process personal data to perform our contract with
          you (providing messaging, sync, and Paid Inbox features), for our
          legitimate interests (preventing abuse, securing infrastructure, and
          diagnosing errors), with your consent (Web Push and optional device
          permissions), and to comply with legal obligations (sanctions and
          anti-fraud compliance).
        </p>
        <p class="${pClass}">
          <span class="${strongClass}">No Sale or Sharing (CCPA/CPRA):</span>
          Alice&amp;Bot does <span class="${strongClass}">not</span> sell your
          personal information and does <span class="${strongClass}">not</span>
          share your personal information for cross-context behavioral
          advertising. To exercise any privacy right, contact the operator via
          ${contactLinks()}.
        </p>
      </section>

      <section>
        <h2 class="${h2Class}">7. International Data Transfers</h2>
        <p class="${pClass}">
          Alice&amp;Bot's hosted infrastructure and primary subprocessors
          (including Cloudflare US, InstantDB, Google Cloud, and PostHog US)
          operate primarily in the <span class="${strongClass}">United States</span>.
          If you access the hosted service from outside the United States, your
          metadata, public profile, and encrypted payloads are transferred to
          and processed in the United States, where data protection laws may
          differ from those in your jurisdiction.
        </p>
      </section>

      <section>
        <h2 class="${h2Class}">8. Age Requirement (18+)</h2>
        <p class="${pClass}">
          The hosted Alice&amp;Bot service is intended strictly for individuals
          who are <span class="${strongClass}">18 years of age or older</span>.
          We do not knowingly collect personal information from anyone under 18.
          If you believe a minor under 18 has used the hosted service, please
          contact the operator via ${contactLinks()} so we can remove the
          associated server records.
        </p>
      </section>

      <section>
        <h2 class="${h2Class}">9. Changes to This Policy &amp; Contact</h2>
        <p class="${pClass}">
          We may update this Privacy Policy as Alice&amp;Bot evolves. Material
          changes will be reflected by updating the "Last updated" date at the
          top of this page. For privacy questions, security reports, or data
          requests, contact the operator via ${contactLinks()}.
        </p>
      </section>
    `,
  );

export const terms = (): TemplateResult =>
  legalShell(
    "terms",
    "Terms of Service",
    "These Terms of Service govern your access to and use of the hosted Alice&Bot service at https://aliceandbot.com, https://api.aliceandbot.com, and the hosted embeddable widget.",
    html`
      <section>
        <h2 class="${h2Class}">1. Acceptance &amp; Eligibility (18+)</h2>
        <p class="${pClass}">
          By accessing or using the hosted Alice&amp;Bot service at
          <span class="${codeClass}">https://aliceandbot.com</span>,
          <span class="${codeClass}">https://api.aliceandbot.com</span>, or our
          hosted embeddable widget (collectively, the
          <span class="${strongClass}">"Hosted Service"</span>), you agree to be
          bound by these Terms of Service and our
          <a href="${privacyPath}" class="${linkClass}">Privacy Policy</a>.
        </p>
        <p class="${pClass}">
          You must be at least <span class="${strongClass}">18 years old</span>
          and legally capable of entering into a binding agreement to use the
          Hosted Service. If you use the Hosted Service on behalf of an
          organization, you represent that you have authority to bind that
          organization to these Terms.
        </p>
      </section>

      <section>
        <h2 class="${h2Class}">
          2. Open-Source Software (MIT License) vs. Hosted Service
        </h2>
        <ul class="${ulClass}">
          <li>
            <span class="${strongClass}">MIT-Licensed Codebase:</span> The
            Alice&amp;Bot source code is made available under the
            <span class="${strongClass}">MIT License</span> on
            <a
              href="https://github.com/uriva/alice-and-bot"
              target="_blank"
              rel="noopener noreferrer"
              class="${linkClass}"
            >GitHub</a>. Your rights to copy, modify, redistribute, or self-host
            the source code are governed strictly by the MIT License.
          </li>
          <li>
            <span class="${strongClass}">Hosted Service Terms:</span> These
            Terms govern your use of the hosted infrastructure, APIs, domains,
            Paid Inbox wallet, and hosted widget provided by Alice&amp;Bot.
          </li>
          <li>
            <span class="${strongClass}">Self-Hosted Instances:</span> If you
            deploy, operate, or use a self-hosted Alice&amp;Bot instance, the
            operator of that instance is solely responsible for infrastructure,
            uptime, security, moderation, legal compliance, privacy disclosures,
            and any liabilities arising from that deployment. Alice&amp;Bot has
            no control over and assumes no responsibility for self-hosted
            instances.
          </li>
        </ul>
      </section>

      <section>
        <h2 class="${h2Class}">3. Cryptographic Key Custody &amp; No Recovery</h2>
        <div class="${calloutClass}">
          <p class="${pClass} mb-0">
            <span class="${strongClass}">Important:</span> Alice&amp;Bot does
            not use emails, phone numbers, or passwords. Your cryptographic
            private keys are generated and stored solely on your own devices or
            servers. <span class="${strongClass}">We never possess your private keys and cannot reset, recover, or restore them.</span>
          </p>
        </div>
        <ul class="${ulClass}">
          <li>
            You are solely responsible for securely backing up your secret
            recovery key and protecting any device, browser, or server where
            your private keys are stored.
          </li>
          <li>
            If you lose your private key, clear browser storage without a
            backup, or lose access to your device, you will
            <span class="${strongClass}">permanently lose access</span> to your
            identity, encrypted messages, encrypted attachments, and any Paid
            Inbox / wallet balance associated with that identity.
          </li>
          <li>
            Anyone who obtains your private key or an active device-transfer QR
            link can impersonate your identity, decrypt your conversations, and
            control your Paid Inbox balance.
          </li>
        </ul>
      </section>

      <section>
        <h2 class="${h2Class}">
          4. Paid Inbox, Custodial USD Wallet &amp; Bitcoin Deposits
        </h2>
        <p class="${pClass}">
          Alice&amp;Bot offers an optional Paid Inbox feature allowing users to
          set a USD price for strangers to initiate conversations, funded via
          Bitcoin (BTC) deposits into a hosted USD ledger balance.
        </p>
        <ul class="${ulClass}">
          <li>
            <span class="${strongClass}">Non-Bank Status:</span> Alice&amp;Bot
            is <span class="${strongClass}">not</span> a bank, credit union,
            licensed money transmitter, or insured depository institution. USD
            balances shown in the Hosted Service are non-interest-bearing
            custodial ledger credits for Paid Inbox functionality and are
            <span class="${strongClass}">not FDIC-insured</span> or backed by
            any government guarantee.
          </li>
          <li>
            <span class="${strongClass}">Bitcoin Deposits &amp; Conversion:</span>
            BTC deposits are converted to USD ledger credits using the live
            <span class="${strongClass}">CoinGecko</span> spot exchange rate
            recorded at deposit preparation/confirmation and verified on-chain
            via <span class="${strongClass}">Mempool.space</span>. You are
            solely responsible for Bitcoin network miner fees and for sending
            the correct amount to the exact address displayed.
          </li>
          <li>
            <span class="${strongClass}">Irreversible Cryptocurrency Transactions:</span>
            All Bitcoin blockchain transactions are final and irreversible.
            Alice&amp;Bot cannot reverse, cancel, or recover funds sent to an
            incorrect address, sent on an unsupported network, or lost due to
            network or wallet error.
          </li>
          <li>
            <span class="${strongClass}">Manual Withdrawals:</span> Eligible
            wallet balances may be withdrawn manually by contacting the operator
            via ${contactLinks()} and proving cryptographic control of your
            identity keypair.
            Withdrawals may be subject to manual review, identity/compliance
            checks, minimum payout amounts, and network or processing fees.
          </li>
          <li>
            <span class="${strongClass}">AML, Sanctions &amp; Anti-Fraud Enforcement:</span>
            You represent that you are not located in, ordinarily resident in,
            or acting on behalf of any person or jurisdiction subject to US
            (OFAC) or other applicable economic sanctions, and that you will not
            use Paid Inbox or wallet features for money laundering, terrorist
            financing, fraud, or unlawful payments. Alice&amp;Bot reserves the
            right to pause, freeze, investigate, refuse withdrawal of, or
            forfeit balances suspected of fraud, abuse, stolen funds, spam
            manipulation, or sanctions/legal violations.
          </li>
          <li>
            <span class="${strongClass}">Pricing &amp; Fee Reservation:</span>
            Core messaging on the Hosted Service is currently offered with zero
            per-message fees. However, Alice&amp;Bot reserves the right to
            introduce, modify, or charge fees for Paid Inbox transactions,
            withdrawals, file attachments, or high-volume storage and bandwidth
            usage with reasonable notice.
          </li>
        </ul>
      </section>

      <section>
        <h2 class="${h2Class}">5. Embeddable Widget Terms</h2>
        <p class="${pClass}">
          If you embed the Alice&amp;Bot chat widget on a website or application
          you control:
        </p>
        <ul class="${ulClass}">
          <li>
            You act as an <span class="${strongClass}">independent data controller</span>
            with respect to your end users and visitors;
          </li>
          <li>
            You are solely responsible for clearly disclosing to your end users
            that the chat widget is powered by Alice&amp;Bot, linking to
            <span class="${codeClass}">https://aliceandbot.com/privacy</span>,
            and obtaining all legally required notices and consents (including
            under GDPR, UK GDPR, ePrivacy, CCPA/CPRA, or local laws) before
            initializing or collecting data through the widget; and
          </li>
          <li>
            You are responsible for configuring participant keys, bots, and
            moderation on your website lawfully.
          </li>
        </ul>
      </section>

      <section>
        <h2 class="${h2Class}">
          6. Third-Party Bots, AI Agents &amp; MCP Clients
        </h2>
        <p class="${pClass}">
          Alice&amp;Bot enables you to communicate with bots, webhooks, AI
          agents, and Model Context Protocol (MCP) clients. Any bot or MCP
          client participating in a conversation decrypts messages using its own
          keys and operates outside Alice&amp;Bot's control.
        </p>
        <ul class="${ulClass}">
          <li>
            Third-party bots and MCP clients may log, store, or transmit your
            decrypted messages to external LLM providers or APIs under their own
            terms and privacy policies.
          </li>
          <li>
            AI-generated outputs may be inaccurate, incomplete, harmful, or
            biased. Alice&amp;Bot does not endorse, verify, or assume any
            liability for third-party bots, webhooks, MCP integrations, or AI
            outputs.
          </li>
        </ul>
      </section>

      <section>
        <h2 class="${h2Class}">7. Acceptable Use &amp; Enforcement</h2>
        <p class="${pClass}">
          You agree not to use the Hosted Service to:
        </p>
        <ul class="${ulClass}">
          <li>Violate any applicable local, state, national, or international law or regulation;</li>
          <li>Distribute child sexual abuse material (CSAM/CSAE), malware, phishing, scams, or unsolicited bulk spam;</li>
          <li>Infringe copyright, trademark, privacy, or other rights of any third party;</li>
          <li>Interfere with, overload, scrape, or attack the Hosted Service, bypass rate limits, or probe vulnerabilities without prior authorization (please report security issues responsibly via ${contactLinks()});</li>
          <li>Evade economic sanctions or conduct unlawful financial transfers through Paid Inbox.</li>
        </ul>
        <p class="${pClass}">
          We may suspend, rate-limit, reclaim <span class="${codeClass}">@alias</span>
          handles, or terminate access to the Hosted Service at any time if we
          reasonably believe you have violated these Terms or pose a security,
          abuse, or legal risk.
        </p>
      </section>

      <section>
        <h2 class="${h2Class}">
          8. Intellectual Property &amp; Trademark Disclaimer
        </h2>
        <p class="${pClass}">
          Except for the open-source codebase licensed under the MIT License and
          content you transmit, Alice&amp;Bot retains all rights in the
          Alice&amp;Bot name, logo, and Hosted Service branding.
        </p>
        <p class="${pClass}">
          <span class="${strongClass}">WhatsApp Non-Affiliation Disclaimer:</span>
          "WhatsApp" is a registered trademark of WhatsApp LLC (Meta Platforms,
          Inc.). Alice&amp;Bot is an independent project and is
          <span class="${strongClass}">not affiliated with, endorsed by, sponsored by, or officially connected with</span>
          WhatsApp LLC or Meta Platforms, Inc. Any reference to WhatsApp on our
          website is used purely for descriptive comparison.
        </p>
      </section>

      <section>
        <h2 class="${h2Class}">9. Disclaimer of Warranties</h2>
        <p class="${pClass}">
          THE HOSTED SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE," WITHOUT
          WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY,
          INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
          PARTICULAR PURPOSE, TITLE, NON-INFRINGEMENT, UNINTERRUPTED
          AVAILABILITY, OR ERROR-FREE OPERATION. WE DO NOT WARRANT THAT MESSAGES,
          ATTACHMENTS, OR BALANCES WILL NEVER BE LOST, DELAYED, OR UNAVAILABLE.
        </p>
      </section>

      <section>
        <h2 class="${h2Class}">10. Limitation of Liability</h2>
        <p class="${pClass}">
          TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, ALICE&amp;BOT AND
          ITS OPERATORS, MAINTAINERS, AND CONTRIBUTORS SHALL NOT BE LIABLE FOR
          ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR
          PUNITIVE DAMAGES, OR ANY LOSS OF DATA, PRIVATE KEYS, PROFITS, REVENUE,
          GOODWILL, OR CRYPTOCURRENCY, ARISING OUT OF OR RELATED TO YOUR USE OF
          THE HOSTED SERVICE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH
          DAMAGES.
        </p>
        <p class="${pClass}">
          IN ALL EVENTS, ALICE&amp;BOT'S TOTAL AGGREGATE LIABILITY FOR ALL
          CLAIMS ARISING OUT OF OR RELATING TO THESE TERMS OR THE HOSTED SERVICE
          SHALL NOT EXCEED THE GREATER OF: (A) THE TOTAL FEES YOU ACTUALLY PAID
          TO ALICE&amp;BOT FOR THE HOSTED SERVICE IN THE TWELVE (12) MONTHS
          IMMEDIATELY PRECEDING THE EVENT GIVING RISE TO LIABILITY, OR (B)
          <span class="${strongClass}">FIFTY U.S. DOLLARS ($50 USD)</span>.
          SOME JURISDICTIONS DO NOT ALLOW CERTAIN LIMITATIONS OF LIABILITY, SO
          THESE LIMITATIONS APPLY TO THE FULLEST EXTENT PERMITTED BY LAW.
        </p>
      </section>

      <section>
        <h2 class="${h2Class}">11. Indemnification</h2>
        <p class="${pClass}">
          You agree to defend, indemnify, and hold harmless Alice&amp;Bot and
          its operators and contributors from and against any third-party
          claims, liabilities, damages, losses, and reasonable attorneys' fees
          arising out of or relating to: (a) your use of the Hosted Service; (b)
          content you send or bots/webhooks you operate; (c) your embedding of
          the Alice&amp;Bot widget on any website or application; or (d) your
          violation of these Terms or applicable law.
        </p>
      </section>

      <section>
        <h2 class="${h2Class}">12. Governing Law &amp; Venue</h2>
        <p class="${pClass}">
          These Terms and any dispute arising out of or relating to them or the
          Hosted Service are governed by and construed in accordance with the
          laws of the <span class="${strongClass}">State of New Mexico, United States</span>,
          without regard to its conflict-of-law principles. Any legal action or
          proceeding arising under these Terms shall be brought exclusively in
          the state or federal courts located in the State of New Mexico, United
          States, and you consent to the personal jurisdiction and venue of
          those courts (except where mandatory consumer protection law in your
          jurisdiction requires otherwise).
        </p>
      </section>

      <section>
        <h2 class="${h2Class}">
          13. Service Changes, Termination &amp; General Provisions
        </h2>
        <ul class="${ulClass}">
          <li>
            <span class="${strongClass}">Modifications &amp; Discontinuation:</span>
            We may modify, suspend, or discontinue any part of the Hosted
            Service at any time. We may update these Terms by posting the
            revised version at <span class="${codeClass}">/terms</span> with an
            updated "Last updated" date; continued use after changes take effect
            constitutes acceptance.
          </li>
          <li>
            <span class="${strongClass}">Severability:</span> If any provision
            of these Terms is found unenforceable, the remaining provisions
            remain in full force and effect.
          </li>
          <li>
            <span class="${strongClass}">Entire Agreement &amp; No Waiver:</span>
            These Terms and our Privacy Policy constitute the entire agreement
            regarding the Hosted Service (while the MIT License governs the
            open-source codebase). Failure to enforce any right is not a waiver.
          </li>
          <li>
            <span class="${strongClass}">Assignment &amp; Force Majeure:</span>
            You may not assign these Terms without our consent; we may assign
            them in connection with a reorganization or transfer of the Hosted
            Service. We are not liable for delays or failures caused by events
            beyond our reasonable control.
          </li>
          <li>
            <span class="${strongClass}">Contact:</span> For legal notices,
            withdrawal requests, or questions regarding these Terms, contact the
            operator via ${contactLinks()}.
          </li>
        </ul>
      </section>
    `,
  );
