const repos = [
  { path: "/home/uri/uriva/homepage/index.html", pattern: /\?v=\d+/g },
  { path: "/home/uri/uriva/alice-and-bot/mod.ts", pattern: /\?v=\d+/g },
  {
    path: "/home/uri/uriva/prompt2bot/server/src/channelHandlers.test.ts",
    pattern: /\?v=\d+/g,
  },
];

const depRepos = [
  "/home/uri/uriva/lurk/deno.json",
  "/home/uri/uriva/find-scene/deno.json",
  "/home/uri/uriva/prompt2bot/deno.json",
  "/home/uri/uriva/sally/deno.json",
];

const newCacheVersion = Deno.args[0];
if (!newCacheVersion || !/^\d+$/.test(newCacheVersion)) {
  console.error("Usage: deno task bump-widget <cache-version>");
  Deno.exit(1);
}

for (const { path, pattern } of repos) {
  const text = await Deno.readTextFile(path);
  const updated = text.replace(pattern, `?v=${newCacheVersion}`);
  if (updated !== text) {
    await Deno.writeTextFile(path, updated);
    console.log(`Bumped widget cache in ${path}`);
  }
}

const ownDenoJson = JSON.parse(await Deno.readTextFile("./deno.json"));
const jsrVersion = ownDenoJson.version;

for (const path of depRepos) {
  try {
    const text = await Deno.readTextFile(path);
    const updated = text.replace(
      /"@alice-and-bot\/core(\/components)?":\s*"jsr:@alice-and-bot\/core@\^[\d.]+(\/components)?"/g,
      `"@alice-and-bot/core$1": "jsr:@alice-and-bot/core@^${jsrVersion}$2"`,
    );
    if (updated !== text) {
      await Deno.writeTextFile(path, updated);
      console.log(`Bumped dep in ${path}`);
    }
  } catch (_err) {
    console.warn(`Could not update dependency in ${path} (skipping)`);
  }
}
