import { assertEquals, assertMatch, assertStringIncludes } from "@std/assert";
import {
  defaultPrimary,
  primaryHue,
  quoteBarColor,
  suggestedMessageButtonStyle,
  titleStyle,
} from "./design.ts";

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

Deno.test("quote bar color matches primary in light mode", () => {
  assertEquals(quoteBarColor(false), "hsl(170, 55%, 45%)");
});

Deno.test("quote bar color matches primary in dark mode", () => {
  assertEquals(quoteBarColor(true), "hsl(170, 42%, 24%)");
});

Deno.test("suggested message buttons are themed with primary color in light and dark mode", () => {
  const defaultLight = suggestedMessageButtonStyle(false);
  const defaultDark = suggestedMessageButtonStyle(true);
  assertStringIncludes(defaultLight, defaultPrimary(false));
  assertStringIncludes(defaultDark, defaultPrimary(true));

  const customLight = suggestedMessageButtonStyle(false, {
    primary: "#16a34a",
    inputBackground: "#ffffff",
  });
  const customDark = suggestedMessageButtonStyle(true, {
    primary: "#16a34a",
    inputBackground: "#131816",
  });
  assertMatch(customLight, /border:1px solid [^;]*#16a34a/);
  assertMatch(customLight, /background:[^;]*#16a34a/);
  assertMatch(customLight, /color:[^;]*#16a34a/);
  assertMatch(customDark, /border:1px solid [^;]*#16a34a/);
  assertMatch(customDark, /background:[^;]*#16a34a/);
  assertMatch(customDark, /color:[^;]*#16a34a/);
});
