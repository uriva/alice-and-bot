import { assertEquals, assertNotEquals } from "@std/assert";
import {
  attachmentPrimaryColor,
  defaultOtherBubble,
  defaultPrimary,
} from "./design.ts";

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
