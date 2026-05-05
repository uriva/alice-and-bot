import { assertStringIncludes } from "@std/assert";
import { avatarImageStyle } from "./chat-avatar.ts";

Deno.test("avatar image style constrains SVG intrinsic size", () => {
  assertStringIncludes(avatarImageStyle, "width:100%");
  assertStringIncludes(avatarImageStyle, "height:100%");
  assertStringIncludes(avatarImageStyle, "max-width:100%");
  assertStringIncludes(avatarImageStyle, "max-height:100%");
  assertStringIncludes(avatarImageStyle, "object-fit:cover");
});
