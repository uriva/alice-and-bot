import {
  assertEquals,
  assertFalse,
  assertMatch,
  assertStringIncludes,
} from "@std/assert";

const indexUrl = new URL("./index.html", import.meta.url);
const manifestUrl = new URL("./public/manifest.json", import.meta.url);
const landingTsUrl = new URL("./src/landing.ts", import.meta.url);
const chatTsUrl = new URL("./src/chat.ts", import.meta.url);
const chatBoxTsUrl = new URL("../lit/components/chat-box.ts", import.meta.url);

Deno.test("landing page restricts green strictly to the word WhatsApp and includes data privacy copy", async () => {
  const [indexHtml, manifestRaw, landingTs, chatTs] = await Promise.all([
    Deno.readTextFile(indexUrl),
    Deno.readTextFile(manifestUrl),
    Deno.readTextFile(landingTsUrl),
    Deno.readTextFile(chatTsUrl),
  ]);
  const manifest = JSON.parse(manifestRaw);

  assertFalse(landingTs.includes("emerald-"));
  assertFalse(landingTs.includes("green-"));
  assertMatch(
    landingTs,
    /<span[^>]*text-\[#1ea952\][^>]*>WhatsApp<\/span>/,
  );
  assertStringIncludes(
    landingTs,
    "without giving anyone access to your data",
  );
  assertStringIncludes(
    indexHtml,
    "without giving anyone access to your data",
  );
  assertEquals(manifest.theme_color, "#141412");
  assertEquals(manifest.background_color, "#0c0c0b");
  assertFalse(chatTs.includes("emerald-"));
});

Deno.test("system bar colors and bottom safe areas match light and dark app chrome", async () => {
  const [indexHtml, chatTs, chatBoxTs] = await Promise.all([
    Deno.readTextFile(indexUrl),
    Deno.readTextFile(chatTsUrl),
    Deno.readTextFile(chatBoxTsUrl),
  ]);

  assertStringIncludes(indexHtml, 'name="color-scheme"');
  assertMatch(
    indexHtml,
    /name="theme-color"[\s\S]*?content="#faf9f5"[\s\S]*?prefers-color-scheme:\s*light/,
  );
  assertMatch(
    indexHtml,
    /name="theme-color"[\s\S]*?content="#141412"[\s\S]*?prefers-color-scheme:\s*dark/,
  );
  assertStringIncludes(chatTs, "env(safe-area-inset-bottom");
  assertStringIncludes(chatBoxTs, "env(safe-area-inset-bottom");
});

Deno.test("index.html does not include render-blocking @tailwindcss/browser CDN script", async () => {
  const indexHtml = await Deno.readTextFile(indexUrl);
  assertFalse(indexHtml.includes("@tailwindcss/browser"));
});
