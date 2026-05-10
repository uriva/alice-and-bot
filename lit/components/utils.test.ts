import { assertEquals, assertMatch } from "@std/assert";
import { buildTimeline, formatFullTimestamp, preprocessText } from "./utils.ts";

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

Deno.test("formatFullTimestamp returns human-readable date and time", () => {
  assertMatch(
    formatFullTimestamp(Date.UTC(2026, 0, 2, 3, 4)),
    /2026|Jan|2|3|4/,
  );
});
