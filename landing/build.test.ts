import { assertEquals } from "@std/assert";

const dist = new URL("./dist/", import.meta.url);

Deno.test("build produces 404.html identical to index.html", async () => {
  const [index, fallback] = await Promise.all(
    ["index.html", "404.html"].map((f) => Deno.readTextFile(new URL(f, dist))),
  );
  assertEquals(index, fallback);
});
