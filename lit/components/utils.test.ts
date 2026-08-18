import { assertEquals, assertMatch } from "@std/assert";
import {
  buildTimeline,
  collectIdentityKeys,
  computeTextareaResize,
  filterParticipants,
  formatFullTimestamp,
  getAutocompleteState,
  insertMention,
  isStale,
  maxTextareaHeight,
  mergeIdentityDetails,
  minTextareaHeight,
  nextVisibleText,
  preprocessText,
  resolveConversationDisplayName,
  sendingStatusText,
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

Deno.test("isStale returns true for timestamps older than 1 hour", () => {
  const oneHourAndAMinuteAgo = Date.now() - (60 * 60 * 1000 + 60_000);
  assertEquals(isStale(oneHourAndAMinuteAgo), true);
});

Deno.test("isStale returns false for timestamps newer than 1 hour", () => {
  const fiftyNineMinutesAgo = Date.now() - (59 * 60 * 1000);
  assertEquals(isStale(fiftyNineMinutesAgo), false);
});

Deno.test("shouldShowScrollDownButton returns true if user has scrolled up a bunch (more than 400px from bottom)", () => {
  assertEquals(shouldShowScrollDownButton(1000, 500, 50), true); // 1000 - 500 - 50 = 450 > 400
  assertEquals(shouldShowScrollDownButton(1000, 599, 1), false); // 1000 - 599 - 1 = 400 not > 400 (false)
  assertEquals(shouldShowScrollDownButton(1000, 600, 50), false); // 1000 - 600 - 50 = 350 <= 400
});

Deno.test("preprocessText converts initial asterisks to standard list bullets and ignores code blocks", () => {
  const result = preprocessText("*item 1\n```\n* inside code\n```\n*item 2");
  assertEquals(result, "* item 1\n```\n* inside code\n```\n* item 2");
});

Deno.test("sendingStatusText returns correct message based on sending type", () => {
  assertEquals(sendingStatusText("audio"), "Sending audio...");
  assertEquals(sendingStatusText("image"), "Uploading image...");
  assertEquals(sendingStatusText("file"), "Sending file...");
  assertEquals(sendingStatusText(null), "Sending audio...");
  assertEquals(sendingStatusText(undefined), "Sending audio...");
});

Deno.test("nextVisibleText jumps HTML opening tag atomically", () => {
  assertEquals(
    nextVisibleText('Hello <a href="https://example.com">world</a>', "Hello "),
    'Hello <a href="https://example.com">',
  );
});

Deno.test("nextVisibleText jumps HTML closing tag atomically", () => {
  assertEquals(
    nextVisibleText(
      'Hello <a href="https://example.com">world</a>!',
      'Hello <a href="https://example.com">world',
    ),
    'Hello <a href="https://example.com">world</a>',
  );
});

Deno.test("preprocessText converts unclosed anchor tags at end of stream into markdown links", () => {
  assertEquals(
    preprocessText('Visit <a href="https://example.com">Google'),
    "Visit [Google](https://example.com)",
  );
});

Deno.test("preprocessText strips incomplete trailing HTML tags to avoid rendering partial html", () => {
  assertEquals(preprocessText('Visit <a href="https://example.c'), "Visit ");
  assertEquals(preprocessText("Visit <a"), "Visit ");
});

Deno.test("preprocessText converts unicode bullets to standard list bullets", () => {
  const result = preprocessText("• כתובת: לוינסקי 81\n• טלפון: 03-6996544");
  assertEquals(result, "* כתובת: לוינסקי 81\n* טלפון: 03-6996544");
});

Deno.test("collectIdentityKeys includes chat list participants when chat switching is enabled", () => {
  const conversations = [
    {
      id: "c1",
      title: "Chat 1",
      participants: [{ publicSignKey: "pk-bot1" }, { publicSignKey: "pk-me" }],
    },
    {
      id: "c2",
      title: "Chat 2",
      participants: [{ publicSignKey: "pk-bot2" }, { publicSignKey: "pk-me" }],
    },
  ];
  const messages = [
    {
      id: "m1",
      type: "text" as const,
      text: "hi",
      timestamp: 100,
      publicSignKey: "pk-bot1",
    },
  ];
  const participants = [{ publicSignKey: "pk-bot1" }];
  const ephemeralStreams = [{
    elementId: "e1",
    text: "typing",
    authorId: "pk-bot3",
    active: true,
    updatedAt: 100,
  }];

  const keysSwitching = collectIdentityKeys({
    messages,
    participants,
    ephemeralStreams,
    conversations,
    enableChatSwitching: true,
  });

  assertEquals(
    keysSwitching.sort(),
    ["pk-bot1", "pk-bot2", "pk-bot3", "pk-me"].sort(),
  );

  const keysSingle = collectIdentityKeys({
    messages,
    participants,
    ephemeralStreams,
    conversations,
    enableChatSwitching: false,
  });

  assertEquals(keysSingle.sort(), ["pk-bot1", "pk-bot3"].sort());
});

Deno.test("mergeIdentityDetails preserves already cached identities across conversation changes", () => {
  const initial = {
    "pk-bot1": { name: "Bot One", avatar: "https://example.com/bot1.png" },
  };
  const incoming = {
    "pk-bot2": { name: "Bot Two", avatar: "https://example.com/bot2.png" },
  };

  const merged = mergeIdentityDetails(initial, incoming);

  assertEquals(merged["pk-bot1"], {
    name: "Bot One",
    avatar: "https://example.com/bot1.png",
  });
  assertEquals(merged["pk-bot2"], {
    name: "Bot Two",
    avatar: "https://example.com/bot2.png",
  });
});

Deno.test("resolveConversationDisplayName uses identityDetails when nameCache is empty", () => {
  const conv = {
    id: "c1",
    title: "",
    participants: [{ publicSignKey: "pk-bot1" }, { publicSignKey: "pk-me" }],
  };
  const nameCache = new Map<string, string | null>();
  const identityDetails = {
    "pk-bot1": { name: "Bot One", avatar: "https://example.com/bot1.png" },
  };

  const name = resolveConversationDisplayName(
    conv,
    "pk-me",
    nameCache,
    identityDetails,
  );
  assertEquals(name, "Bot One");
});
