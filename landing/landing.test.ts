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
  assertEquals(manifest.theme_color, "#181715");
  assertFalse(chatTs.includes("emerald-"));
});
