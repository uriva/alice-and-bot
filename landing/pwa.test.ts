import { assertEquals } from "@std/assert";

const indexUrl = new URL("./index.html", import.meta.url);
const manifestUrl = new URL("./public/manifest.json", import.meta.url);
const landingTsUrl = new URL("./src/landing.ts", import.meta.url);

Deno.test("index.html links web app manifest and removes broken sideload APK links", async () => {
  const [indexHtml, manifestRaw, landingTs] = await Promise.all([
    Deno.readTextFile(indexUrl),
    Deno.readTextFile(manifestUrl),
    Deno.readTextFile(landingTsUrl),
  ]);
  const manifest = JSON.parse(manifestRaw);

  assertEquals(indexHtml.includes('rel="manifest"'), true);
  assertEquals(indexHtml.includes('href="/manifest.json"'), true);
  assertEquals(manifest.display, "standalone");
  assertEquals(manifest.start_url, "/chat");
  assertEquals(landingTs.includes("app-debug.apk"), false);
});
