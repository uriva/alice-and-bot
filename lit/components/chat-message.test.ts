import { assertEquals, assertFalse, assertNotEquals } from "@std/assert";
import {
  attachmentPrimaryColor,
  defaultOtherBubble,
  defaultPrimary,
  isLightColor,
  messageBubbleColor,
  messageParticipantColor,
  quoteBarColor,
  shouldShowAvatar,
  shouldShowName,
} from "./design.ts";
import { renderMarkdown } from "./markdown.ts";

Deno.test("attachmentPrimaryColor uses custom primary when provided", () => {
  assertEquals(attachmentPrimaryColor(true, { primary: "#ff0000" }), "#ff0000");
});

Deno.test("attachmentPrimaryColor falls back to defaultPrimary for dark", () => {
  assertEquals(attachmentPrimaryColor(true), defaultPrimary(true));
});

Deno.test("attachmentPrimaryColor does not use otherBubble color even when set", () => {
  const otherBubble = defaultOtherBubble(true);
  assertNotEquals(
    attachmentPrimaryColor(true, { otherBubble, primary: "#00ff00" }),
    otherBubble,
  );
});

Deno.test("attachmentPrimaryColor ignores otherBubble when primary not set", () => {
  const otherBubble = defaultOtherBubble(true);
  assertEquals(
    attachmentPrimaryColor(true, { otherBubble }),
    defaultPrimary(true),
  );
});

Deno.test(
  "1:1 chat other message bubble and name have different colors",
  () => {
    const bubble = messageBubbleColor({
      isOwn: false,
      isDark: false,
      customColors: undefined,
    });
    const participant = messageParticipantColor({
      isGroupChat: false,
      isDark: false,
      customColors: undefined,
      authorId: "x",
    });
    assertNotEquals(bubble, participant);
  },
);

Deno.test(
  "1:1 chat other message bubble and name differ with custom primary",
  () => {
    const customColors = { primary: "#ff0000" };
    const bubble = messageBubbleColor({
      isOwn: false,
      isDark: false,
      customColors,
    });
    const participant = messageParticipantColor({
      isGroupChat: false,
      isDark: false,
      customColors,
      authorId: "x",
    });
    assertNotEquals(bubble, participant);
  },
);

Deno.test("other message text color is dark in light mode", () => {
  const bubble = messageBubbleColor({
    isOwn: false,
    isDark: false,
    customColors: undefined,
  });
  const textColor = isLightColor(bubble) ? "#222" : "#fff";
  assertEquals(textColor, "#222");
});

Deno.test("quote bar color uses primary not blue", () => {
  const color = quoteBarColor(false);
  assertFalse(
    color.startsWith("#4f") || color.startsWith("#63") ||
      color.startsWith("#81"),
  );
});

Deno.test("avatar hidden in 1:1 chat", () => {
  assertFalse(
    shouldShowAvatar({
      isStartOfSequence: true,
      isOwn: false,
      isGroupChat: false,
    }),
  );
});

Deno.test("avatar shown in group chat", () => {
  assertEquals(
    shouldShowAvatar({
      isStartOfSequence: true,
      isOwn: false,
      isGroupChat: true,
    }),
    true,
  );
});

Deno.test("name hidden in 1:1 chat", () => {
  assertFalse(
    shouldShowName({
      isStartOfSequence: true,
      isOwn: false,
      isGroupChat: false,
      hideNames: false,
    }),
  );
});

Deno.test("name shown in group chat", () => {
  assertEquals(
    shouldShowName({
      isStartOfSequence: true,
      isOwn: false,
      isGroupChat: true,
      hideNames: false,
    }),
    true,
  );
});

Deno.test("fenced code block has fenced-code-wrap class for copy handler", () => {
  const html = renderMarkdown("```ts\nconst x = 1;\n```", "#222", false);
  assertEquals(html.includes('class="fenced-code-wrap'), true);
});

Deno.test("renderMarkdown renders paragraphs as semantic p tags without nested block divs", () => {
  const html = renderMarkdown("Hello World", "#222", false);
  assertEquals(html.startsWith('<p dir="auto"'), true);
  assertEquals(html.endsWith('</p>'), true);
});
