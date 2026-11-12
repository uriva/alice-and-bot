import {
  assertEquals,
  assertFalse,
  assertMatch,
  assertStringIncludes,
} from "@std/assert";
import {
  avatarColor,
  defaultOtherBubble,
  defaultPrimary,
  primaryHue,
  quoteBarColor,
  suggestedMessageButtonStyle,
  titleStyle,
  widgetColors,
} from "./design.ts";

Deno.test("primary hue is a calm dusk slate instead of green/teal", () => {
  assertEquals(primaryHue, 215);
});

Deno.test("default primary matches warm landing palette in light and dark mode", () => {
  assertEquals(defaultPrimary(false), "hsl(215, 38%, 36%)");
  assertEquals(defaultPrimary(true), "hsl(215, 34%, 28%)");
});

Deno.test("chat surfaces match warm paper and carbon landing palette", () => {
  assertEquals(widgetColors(false).backgroundColor, "#f6f4ee");
  assertEquals(widgetColors(true).backgroundColor, "#0c0c0b");
  assertEquals(defaultOtherBubble(false), "#ffffff");
  assertEquals(defaultOtherBubble(true), "#171614");
});

Deno.test("chat header uses clean neutral surface by default and custom primary when specified", () => {
  const lightCss = titleStyle(false);
  const darkCss = titleStyle(true);
  assertStringIncludes(lightCss, "color:#181715");
  assertStringIncludes(darkCss, "color:#f3f1ea");
  assertFalse(lightCss.includes(defaultPrimary(false)));

  const customCss = titleStyle(false, { primary: "#181715" });
  assertMatch(customCss, /background:#181715/);
  assertMatch(customCss, /color:#fff/);
});

Deno.test("avatar palette avoids harsh green hues", () => {
  const sampleColors = ["alice", "bob", "coder", "qa", "deploy", "ops"].map(
    (name) => avatarColor(name, false),
  );
  sampleColors.forEach((c) => {
    assertFalse(c.startsWith("hsl(105,") || c.startsWith("hsl(150,"));
  });
});

Deno.test("quote bar color matches primary in light and dark mode", () => {
  assertEquals(quoteBarColor(false), "hsl(215, 38%, 36%)");
  assertEquals(quoteBarColor(true), "hsl(215, 34%, 28%)");
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
