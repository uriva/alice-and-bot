import { assertEquals, assertMatch } from "@std/assert";
import { defaultPrimary, primaryHue, titleStyle } from "./design.ts";

Deno.test("primary hue is a pleasant teal instead of harsh blue", () => {
  assertEquals(primaryHue, 170);
});

Deno.test("default primary for light mode is a pleasant teal", () => {
  assertEquals(defaultPrimary(false), "hsl(170, 55%, 45%)");
});

Deno.test("default primary for dark mode is a deep teal", () => {
  assertEquals(defaultPrimary(true), "hsl(170, 42%, 24%)");
});

Deno.test("chat header uses primary color as background", () => {
  const css = titleStyle(false);
  assertMatch(css, /background:hsl\(170, 55%, 45%\)/);
});

Deno.test("chat header text contrasts on primary background", () => {
  const css = titleStyle(false);
  assertMatch(css, /color:#fff/);
});
