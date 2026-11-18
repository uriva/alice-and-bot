import { assertEquals } from "@std/assert";

const indexUrl = new URL("./index.html", import.meta.url);
const manifestUrl = new URL("./public/manifest.json", import.meta.url);
const swUrl = new URL("./public/sw.js", import.meta.url);
const badgeUrl = new URL("./public/badge-96.png", import.meta.url);
const maskable192Url = new URL(
  "./public/icon-maskable-192.png",
  import.meta.url,
);
const maskable512Url = new URL(
  "./public/icon-maskable-512.png",
  import.meta.url,
);
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

Deno.test("manifest separates any and maskable icons and ships monochrome notification badge", async () => {
  const [manifestRaw, swRaw, badgeBytes, mask192Bytes, mask512Bytes] =
    await Promise.all([
      Deno.readTextFile(manifestUrl),
      Deno.readTextFile(swUrl),
      Deno.readFile(badgeUrl),
      Deno.readFile(maskable192Url),
      Deno.readFile(maskable512Url),
    ]);
  const manifest = JSON.parse(manifestRaw);
  const purposes: string[] = manifest.icons.map((i: { purpose?: string }) =>
    i.purpose ?? ""
  );

  assertEquals(purposes.includes("any maskable"), false);
  assertEquals(purposes.includes("any"), true);
  assertEquals(purposes.includes("maskable"), true);
  assertEquals(badgeBytes.byteLength > 100, true);
  assertEquals(mask192Bytes.byteLength > 100, true);
  assertEquals(mask512Bytes.byteLength > 100, true);
  assertEquals(swRaw.includes("/badge-96.png"), true);
  assertEquals(swRaw.includes("dismiss"), true);
  assertEquals(swRaw.includes("alice:select-conversation"), true);
});
