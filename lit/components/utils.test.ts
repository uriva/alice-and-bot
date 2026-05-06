import { assertEquals, assertMatch } from "@std/assert";
import { buildTimeline, preprocessText } from "./utils.ts";

Deno.test("preprocessText converts multiline html code blocks to fenced markdown", () => {
  const input = [
    "before",
    "<code>",
    'const url = "https://example.invalid/screener";<br>',
    "const token = xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx;<br>",
    "</code>",
    "after",
  ].join("\n");

  const result = preprocessText(input);

  assertMatch(
    result,
    /```[\s\S]*const url = "https:\/\/example\.invalid\/screener";[\s\S]*const token = x+/,
  );
});

Deno.test("buildTimeline excludes active empty streams to avoid empty chat bubbles", () => {
  const result = buildTimeline([], [], [], [{
    authorName: "Bot",
    text: "",
    elementId: "empty-stream",
    timestamp: 1,
    active: true,
  }]);

  assertEquals(result, []);
});
