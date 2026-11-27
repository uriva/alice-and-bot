import {
  assertEquals,
  assertFalse,
  assertMatch,
  assertStringIncludes,
} from "@std/assert";

const pathsUrl = new URL("./src/paths.ts", import.meta.url);
const mainUrl = new URL("./src/main.ts", import.meta.url);
const legalUrl = new URL("./src/legal.ts", import.meta.url);
const landingUrl = new URL("./src/landing.ts", import.meta.url);
const chatUrl = new URL("./src/chat.ts", import.meta.url);
const widgetUrl = new URL("../widget/src/widget.ts", import.meta.url);

Deno.test("paths and router wire /legal, /privacy, and /terms routes", async () => {
  const [pathsTs, mainTs] = await Promise.all([
    Deno.readTextFile(pathsUrl),
    Deno.readTextFile(mainUrl),
  ]);

  assertStringIncludes(pathsTs, 'export const legalPath = "/legal"');
  assertStringIncludes(pathsTs, 'export const privacyPath = "/privacy"');
  assertStringIncludes(pathsTs, 'export const termsPath = "/terms"');

  assertStringIncludes(mainTs, "privacyPath");
  assertStringIncludes(mainTs, "termsPath");
  assertMatch(mainTs, /path:\s*privacyPath[\s\S]*?\.privacy\(\)/);
  assertMatch(mainTs, /path:\s*termsPath[\s\S]*?\.terms\(\)/);
  assertMatch(mainTs, /path:\s*legalPath[\s\S]*?\.legal\(\)/);
});

Deno.test("PostHog is hardened and skipped on /chat routes", async () => {
  const mainTs = await Deno.readTextFile(mainUrl);

  assertMatch(mainTs, /autocapture:\s*false/);
  assertMatch(mainTs, /disable_session_recording:\s*true/);
  assertMatch(mainTs, /persistence:\s*["']memory["']/);
  assertMatch(mainTs, /isChatRoute/);
});

Deno.test("Sign Out in chat.ts calls unregisterPush before clearing local credentials and push key store", async () => {
  const chatTs = await Deno.readTextFile(chatUrl);

  const unregisterIdx = chatTs.indexOf("unregisterPush(");
  const removeCredsIdx = chatTs.indexOf(
    'localStorage.removeItem("alicebot_credentials")',
  );
  const clearPushIdx = chatTs.indexOf("clearPushKeyStore()");

  assertEquals(unregisterIdx > 0, true);
  assertEquals(removeCredsIdx > unregisterIdx, true);
  assertEquals(clearPushIdx > unregisterIdx, true);
});

Deno.test("landing, chat, and widget expose legal links and reconciled pricing copy", async () => {
  const [landingTs, chatTs, widgetTs] = await Promise.all([
    Deno.readTextFile(landingUrl),
    Deno.readTextFile(chatUrl),
    Deno.readTextFile(widgetUrl),
  ]);

  assertStringIncludes(landingTs, "privacyPath");
  assertStringIncludes(landingTs, "termsPath");
  assertStringIncludes(landingTs, "Privacy Policy");
  assertStringIncludes(landingTs, "Terms of Service");
  assertFalse(landingTs.includes("$0 forever"));

  assertStringIncludes(chatTs, "privacyPath");
  assertStringIncludes(chatTs, "termsPath");
  assertStringIncludes(chatTs, "Privacy Policy");
  assertStringIncludes(chatTs, "Terms of Service");

  assertStringIncludes(widgetTs, "https://aliceandbot.com/privacy");
});

Deno.test("legal pages export styled legal, privacy, and terms views with required disclosures", async () => {
  const legalTs = await Deno.readTextFile(legalUrl);

  assertStringIncludes(legalTs, "export const legal =");
  assertStringIncludes(legalTs, "export const privacy =");
  assertStringIncludes(legalTs, "export const terms =");
  assertStringIncludes(legalTs, "header()");
  assertFalse(legalTs.includes("max-width:700px"));
  assertFalse(legalTs.includes("support@aliceandbot.com"));
  assertFalse(legalTs.includes("indefinitely"));

  const requiredPhrases = [
    "November 27, 2026",
    "retentionDays",
    "Google Cloud Storage lifecycle rule",
    "https://github.com/uriva/alice-and-bot",
    "https://uriv.me",
    "New Mexico",
    "MIT License",
    "POST /ui-update",
    "voice.prompt2bot.com",
    "basemaps.cartocdn.com",
    "lastActiveAt",
    "Cloudflare",
    "InstantDB",
    "Google Cloud Storage",
    "PostHog",
    "Anomalisa",
    "CoinGecko",
    "Mempool.space",
    "QRServer",
    "Twilio",
    "alicebot_push_store",
    "18",
    "$50",
    "WhatsApp",
  ];
  requiredPhrases.forEach((phrase) => assertStringIncludes(legalTs, phrase));
});
