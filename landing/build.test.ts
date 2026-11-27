import { assertEquals, assertStringIncludes } from "@std/assert";
import { routeMetaByPath } from "./src/route-meta.ts";

const dist = new URL("./dist/", import.meta.url);

Deno.test("build produces 404.html identical to index.html", async () => {
  const [index, fallback] = await Promise.all(
    ["index.html", "404.html"].map((f) => Deno.readTextFile(new URL(f, dist))),
  );
  assertEquals(index, fallback);
});

Deno.test("build generates per-route static HTML with route metadata for SEO", async () => {
  const routes = Object.entries(routeMetaByPath).filter(([p]) => p !== "/");
  await Promise.all(
    routes.map(async ([routePath, meta]) => {
      const html = await Deno.readTextFile(
        new URL(`${routePath.slice(1)}/index.html`, dist),
      );
      const expectedTitle = meta.title.replaceAll("&", "&amp;");
      assertStringIncludes(html, `<title>${expectedTitle}</title>`);
      assertStringIncludes(
        html,
        `href="https://aliceandbot.com${meta.canonicalPath ?? routePath}"`,
      );
    }),
  );
});
