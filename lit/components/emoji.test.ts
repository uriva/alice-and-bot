import { assertEquals } from "@std/assert";
import {
  convertCompletedShortcodeAtCursor,
  getEmojiAutocompleteState,
  insertEmoji,
  lookupEmoji,
  parseReactionCommand,
  replaceEmojiShortcodes,
  searchEmojis,
} from "./emoji.ts";

Deno.test("lookupEmoji resolves standard Slack/GitHub/Discord shortcodes and aliases", () => {
  assertEquals(lookupEmoji("+1"), "👍");
  assertEquals(lookupEmoji("thumbsup"), "👍");
  assertEquals(lookupEmoji("-1"), "👎");
  assertEquals(lookupEmoji("thumbsdown"), "👎");
  assertEquals(lookupEmoji("heart"), "❤️");
  assertEquals(lookupEmoji("FIRE"), "🔥");
  assertEquals(lookupEmoji("rocket"), "🚀");
  assertEquals(lookupEmoji("check"), "✅");
  assertEquals(lookupEmoji("nonexistent_code"), undefined);
});

Deno.test("searchEmojis ranks exact shortcode matches first", () => {
  const plusOne = searchEmojis("+1");
  assertEquals(plusOne[0]?.shortcode, "+1");
  assertEquals(plusOne[0]?.emoji, "👍");

  const thumbs = searchEmojis("thumbs");
  assertEquals(thumbs[0]?.emoji, "👍");
  assertEquals(thumbs[1]?.emoji, "👎");

  const emptyQuery = searchEmojis("", 5);
  assertEquals(emptyQuery.length, 5);
});

Deno.test("getEmojiAutocompleteState triggers on :shortcode, +:, and -: while ignoring URLs and emoticons", () => {
  assertEquals(getEmojiAutocompleteState(":+1", 3), {
    triggerIndex: 0,
    filter: "+1",
    reactionMode: null,
  });
  assertEquals(getEmojiAutocompleteState("nice :fir", 9), {
    triggerIndex: 5,
    filter: "fir",
    reactionMode: null,
  });
  assertEquals(getEmojiAutocompleteState("+:", 2), {
    triggerIndex: 1,
    filter: "",
    reactionMode: "add",
  });
  assertEquals(getEmojiAutocompleteState("+:+1", 4), {
    triggerIndex: 1,
    filter: "+1",
    reactionMode: "add",
  });
  assertEquals(getEmojiAutocompleteState("-:heart", 7), {
    triggerIndex: 1,
    filter: "heart",
    reactionMode: "remove",
  });
  assertEquals(getEmojiAutocompleteState(":", 1), null);
  assertEquals(getEmojiAutocompleteState(":)", 2), null);
  assertEquals(getEmojiAutocompleteState("https://example.com", 19), null);
  assertEquals(getEmojiAutocompleteState("12:30", 5), null);
  assertEquals(getEmojiAutocompleteState("foo:bar", 7), null);
  assertEquals(getEmojiAutocompleteState("hello :+1 ", 10), null);
});

Deno.test("insertEmoji adds trailing space in messages and omits it in reaction commands", () => {
  assertEquals(insertEmoji("nice :+1", 5, 8, "👍", null), {
    newText: "nice 👍 ",
    newCursorIndex: 8,
  });
  assertEquals(insertEmoji("+:+1", 1, 4, "👍", "add"), {
    newText: "+👍",
    newCursorIndex: 3,
  });
  assertEquals(insertEmoji("-:fire", 1, 6, "🔥", "remove"), {
    newText: "-🔥",
    newCursorIndex: 3,
  });
});

Deno.test("convertCompletedShortcodeAtCursor replaces :shortcode: inline when closing colon is typed", () => {
  assertEquals(convertCompletedShortcodeAtCursor(":+1:", 4), {
    text: "👍",
    cursorIndex: 2,
  });
  assertEquals(convertCompletedShortcodeAtCursor("ship it :rocket:", 16), {
    text: "ship it 🚀",
    cursorIndex: 10,
  });
  assertEquals(convertCompletedShortcodeAtCursor("+:+1:", 5), {
    text: "+👍",
    cursorIndex: 3,
  });
  assertEquals(convertCompletedShortcodeAtCursor("-:heart:", 8), {
    text: "-❤️",
    cursorIndex: 3,
  });
  assertEquals(convertCompletedShortcodeAtCursor("10:30:", 6), null);
  assertEquals(convertCompletedShortcodeAtCursor("http://foo:", 11), null);
  assertEquals(convertCompletedShortcodeAtCursor(":unknown_emoji:", 15), null);
});

Deno.test("replaceEmojiShortcodes converts shortcodes outside inline and fenced code", () => {
  assertEquals(
    replaceEmojiShortcodes("great work :+1: :fire:"),
    "great work 👍 🔥",
  );
  assertEquals(
    replaceEmojiShortcodes("keep `:+1:` literal and convert :+1:"),
    "keep `:+1:` literal and convert 👍",
  );
  assertEquals(
    replaceEmojiShortcodes("```\n:+1:\n```\n:+1:"),
    "```\n:+1:\n```\n👍",
  );
  assertEquals(
    replaceEmojiShortcodes("visit http://localhost:8080/a:b:c"),
    "visit http://localhost:8080/a:b:c",
  );
});

Deno.test("parseReactionCommand parses Slack/Discord +emoji and -emoji reaction syntax", () => {
  assertEquals(parseReactionCommand("+:+1:"), { emoji: "👍", remove: false });
  assertEquals(parseReactionCommand("+:+1"), { emoji: "👍", remove: false });
  assertEquals(parseReactionCommand("+:thumbsup:"), {
    emoji: "👍",
    remove: false,
  });
  assertEquals(parseReactionCommand("+👍"), { emoji: "👍", remove: false });
  assertEquals(parseReactionCommand("+ ❤️"), { emoji: "❤️", remove: false });
  assertEquals(parseReactionCommand("-:+1:"), { emoji: "👍", remove: true });
  assertEquals(parseReactionCommand("-🔥"), { emoji: "🔥", remove: true });

  assertEquals(parseReactionCommand("+1"), null);
  assertEquals(parseReactionCommand("-1"), null);
  assertEquals(parseReactionCommand("+hello"), null);
  assertEquals(parseReactionCommand("+👍 great"), null);
  assertEquals(parseReactionCommand("👍"), null);
  assertEquals(parseReactionCommand("+:unknown_code:"), null);
});
