import { assertEquals, assertMatch } from "@std/assert";
import {
  buildTimeline,
  computeTextareaResize,
  filterParticipants,
  formatFullTimestamp,
  getAutocompleteState,
  insertMention,
  maxTextareaHeight,
  minTextareaHeight,
  preprocessText,
  shouldShowScrollDownButton,
} from "./utils.ts";

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

Deno.test("getAutocompleteState triggers correctly", () => {
  assertEquals(getAutocompleteState("hello @jo", 9), {
    triggerIndex: 6,
    filter: "jo",
  });
  assertEquals(getAutocompleteState("@", 1), { triggerIndex: 0, filter: "" });
  assertEquals(getAutocompleteState("hello @john doe", 15), null);
  assertEquals(getAutocompleteState("foo@bar.com", 11), null);
});

Deno.test("filterParticipants filters correctly", () => {
  const participants = [
    { publicSignKey: "pk1", name: "Alice", avatar: "" },
    { publicSignKey: "pk2", name: "Bob", avatar: "" },
  ];
  assertEquals(filterParticipants(participants, "al"), [
    { publicSignKey: "pk1", name: "Alice", avatar: "" },
  ]);
  assertEquals(filterParticipants(participants, "pk2"), [
    { publicSignKey: "pk2", name: "Bob", avatar: "" },
  ]);
});

Deno.test("insertMention inserts name with trailing space", () => {
  assertEquals(insertMention("hello @jo", 6, 9, "John"), {
    newText: "hello @John ",
    newCursorIndex: 12,
  });
});

Deno.test("computeTextareaResize lets a long wrapped single line scroll instead of clipping", () => {
  const result = computeTextareaResize(284);
  assertEquals(result.overflow, "auto");
  assertEquals(result.height, maxTextareaHeight);
});

Deno.test("computeTextareaResize keeps short input at min height with no scrollbar", () => {
  assertEquals(computeTextareaResize(30), {
    height: minTextareaHeight,
    overflow: "hidden",
  });
});

Deno.test("computeTextareaResize grows with content until the cap", () => {
  assertEquals(computeTextareaResize(120), {
    height: 120,
    overflow: "hidden",
  });
});

Deno.test("shouldShowScrollDownButton returns true if user has scrolled up a bunch (more than 400px from bottom)", () => {
  assertEquals(shouldShowScrollDownButton(1000, 500, 50), true); // 1000 - 500 - 50 = 450 > 400
  assertEquals(shouldShowScrollDownButton(1000, 599, 1), false); // 1000 - 599 - 1 = 400 not > 400 (false)
  assertEquals(shouldShowScrollDownButton(1000, 600, 50), false); // 1000 - 600 - 50 = 350 <= 400
});
