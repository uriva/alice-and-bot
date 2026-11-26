import { assertEquals } from "@std/assert";
import {
  classifyGlobalShortcut,
  findLastEditableMessageId,
  findLatestMessage,
  isGlobalChord,
  nextThreadId,
  shortcutHelpGroups,
  stepSelectedMessageId,
} from "./shortcuts.ts";
import type { AbstracChatMessage } from "./types.ts";

const makeMsg = (
  id: string,
  authorId: string,
  timestamp: number,
): AbstracChatMessage => ({
  id,
  authorId,
  authorName: authorId,
  text: `Message ${id}`,
  timestamp,
});

Deno.test("nextThreadId cycles across threads and handles empty or unselected state", () => {
  const ids = ["c1", "c2", "c3"];
  assertEquals(nextThreadId([], null, "next"), null);
  assertEquals(nextThreadId(ids, null, "next"), "c1");
  assertEquals(nextThreadId(ids, null, "prev"), "c3");
  assertEquals(nextThreadId(ids, "c1", "next"), "c2");
  assertEquals(nextThreadId(ids, "c3", "next"), "c1");
  assertEquals(nextThreadId(ids, "c1", "prev"), "c3");
  assertEquals(nextThreadId(ids, "c2", "prev"), "c1");
});

Deno.test("classifyGlobalShortcut recognizes thread navigation, search, and help shortcuts", () => {
  assertEquals(
    classifyGlobalShortcut({
      key: "ArrowUp",
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
    }),
    { type: "prev-thread" },
  );
  assertEquals(
    classifyGlobalShortcut({
      key: "ArrowDown",
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
    }),
    { type: "next-thread" },
  );
  assertEquals(
    classifyGlobalShortcut({
      key: "k",
      altKey: false,
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
    }),
    { type: "focus-search" },
  );
  assertEquals(
    classifyGlobalShortcut({
      key: "K",
      altKey: false,
      ctrlKey: false,
      metaKey: true,
      shiftKey: false,
    }),
    { type: "focus-search" },
  );
  assertEquals(
    classifyGlobalShortcut({
      key: "/",
      altKey: false,
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
    }),
    { type: "toggle-shortcuts-help" },
  );
  assertEquals(
    classifyGlobalShortcut({
      key: "?",
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: true,
      target: { tagName: "DIV" } as unknown as EventTarget,
    }),
    { type: "toggle-shortcuts-help" },
  );
  assertEquals(
    classifyGlobalShortcut({
      key: "?",
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: true,
      target: { tagName: "TEXTAREA" } as unknown as EventTarget,
    }),
    null,
  );
  assertEquals(
    isGlobalChord({
      key: "ArrowDown",
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
    }),
    true,
  );
  assertEquals(
    isGlobalChord({
      key: "a",
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
    }),
    false,
  );
});

Deno.test("findLastEditableMessageId finds most recent own message within edit window", () => {
  const now = 1_000_000;
  const messages = [
    makeMsg("m1", "me", now - 600_000),
    makeMsg("m2", "me", now - 60_000),
    makeMsg("m3", "bot", now - 10_000),
  ];
  assertEquals(findLastEditableMessageId(messages, "me", now), "m2");
  assertEquals(
    findLastEditableMessageId([makeMsg("m1", "me", now - 600_000)], "me", now),
    null,
  );
  assertEquals(
    findLastEditableMessageId([makeMsg("m3", "bot", now - 10_000)], "me", now),
    null,
  );
});

Deno.test("findLastEditableMessageId selects newest own message even when messages arrive newest-first", () => {
  const now = 1_000_000;
  const descending = [
    makeMsg("m4", "bot", now - 5_000),
    makeMsg("m3", "me", now - 10_000),
    makeMsg("m2", "me", now - 60_000),
    makeMsg("m1", "me", now - 600_000),
  ];
  assertEquals(findLastEditableMessageId(descending, "me", now), "m3");
});

Deno.test("stepSelectedMessageId moves backward through messages and exits past newest", () => {
  const messages = [
    makeMsg("m1", "bot", 100),
    makeMsg("m2", "me", 200),
    makeMsg("m3", "bot", 300),
  ];
  assertEquals(stepSelectedMessageId(messages, null, "prev"), "m3");
  assertEquals(stepSelectedMessageId(messages, "m3", "prev"), "m2");
  assertEquals(stepSelectedMessageId(messages, "m2", "prev"), "m1");
  assertEquals(stepSelectedMessageId(messages, "m1", "prev"), "m1");
  assertEquals(stepSelectedMessageId(messages, "m1", "next"), "m2");
  assertEquals(stepSelectedMessageId(messages, "m2", "next"), "m3");
  assertEquals(stepSelectedMessageId(messages, "m3", "next"), null);
  assertEquals(stepSelectedMessageId([], null, "prev"), null);
});

Deno.test("stepSelectedMessageId follows chronological order even when messages arrive newest-first", () => {
  const descending = [
    makeMsg("m3", "bot", 300),
    makeMsg("m2", "me", 200),
    makeMsg("m1", "bot", 100),
  ];
  assertEquals(stepSelectedMessageId(descending, null, "prev"), "m3");
  assertEquals(stepSelectedMessageId(descending, "m3", "prev"), "m2");
  assertEquals(stepSelectedMessageId(descending, "m2", "prev"), "m1");
  assertEquals(stepSelectedMessageId(descending, "m1", "next"), "m2");
  assertEquals(stepSelectedMessageId(descending, "m3", "next"), null);
});

Deno.test("findLatestMessage returns newest message regardless of input order", () => {
  const oldest = makeMsg("m1", "bot", 100);
  const middle = makeMsg("m2", "me", 200);
  const newest = makeMsg("m3", "bot", 300);
  assertEquals(findLatestMessage([oldest, middle, newest])?.id, "m3");
  assertEquals(findLatestMessage([newest, middle, oldest])?.id, "m3");
  assertEquals(findLatestMessage([]), null);
});

Deno.test("shortcutHelpGroups adapts modifier symbols to platform", () => {
  const macGroups = shortcutHelpGroups(true);
  const winGroups = shortcutHelpGroups(false);
  assertEquals(macGroups[0].items[0].keys, ["⌥", "↑"]);
  assertEquals(winGroups[0].items[0].keys, ["Alt", "↑"]);
  assertEquals(macGroups[0].items[2].keys, ["⌘", "K"]);
  assertEquals(winGroups[0].items[2].keys, ["Ctrl", "K"]);
});
