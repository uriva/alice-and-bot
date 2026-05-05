import { assertStringIncludes } from "@std/assert";
import { avatarContainerStyle, avatarImageStyle } from "./chat-avatar.ts";

Deno.test("avatar image style constrains SVG intrinsic size", () => {
  assertStringIncludes(avatarImageStyle, "width:100%");
  assertStringIncludes(avatarImageStyle, "height:100%");
  assertStringIncludes(avatarImageStyle, "max-width:100%");
  assertStringIncludes(avatarImageStyle, "max-height:100%");
  assertStringIncludes(avatarImageStyle, "object-fit:cover");
});

Deno.test("avatar image container has no colored inset ring", () => {
  assertStringIncludes(avatarContainerStyle("#f0a", true, true), "padding:0");
  assertStringIncludes(
    avatarContainerStyle("#f0a", true, true),
    "background:transparent",
  );
  assertStringIncludes(
    avatarContainerStyle("#f0a", true, false),
    "padding:4px",
  );
  assertStringIncludes(
    avatarContainerStyle("#f0a", true, false),
    "background:#f0a",
  );
});
