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
  assertMatch(defaultLight, /hsl\(215,/);
  assertMatch(defaultDark, /hsl\(215,/);

  const customLight = suggestedMessageButtonStyle(false, {
    primary: "#16a34a",
    inputBackground: "#ffffff",
  });
  const customDark = suggestedMessageButtonStyle(true, {
    primary: "#16a34a",
    inputBackground: "#131816",
  });
  assertMatch(customLight, /hsl\(142,|#16a34a/);
  assertMatch(customDark, /hsl\(142,|#16a34a/);
});

const hexRgb = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
};

const hslChan = (h: number, s: number, l: number) => (n: number) => {
  const k = (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
};

const resolveCssRgb = (css: string): [number, number, number] => {
  const trimmed = css.trim();
  if (trimmed.startsWith("#")) return hexRgb(trimmed);
  const hsl = trimmed.match(
    /^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/i,
  );
  if (hsl) {
    const h = Number(hsl[1]);
    const s = Number(hsl[2]) / 100;
    const l = Number(hsl[3]) / 100;
    return [hslChan(h, s, l)(0), hslChan(h, s, l)(8), hslChan(h, s, l)(4)];
  }
  const rgb = trimmed.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i,
  );
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  const mix = trimmed.match(
    /^color-mix\(in srgb,\s*(.+?)\s+([\d.]+)%,\s*(.+)\)$/i,
  );
  if (mix) {
    const c1 = resolveCssRgb(mix[1]);
    const p = Number(mix[2]) / 100;
    const c2 = resolveCssRgb(mix[3]);
    return [
      Math.round(c1[0] * p + c2[0] * (1 - p)),
      Math.round(c1[1] * p + c2[1] * (1 - p)),
      Math.round(c1[2] * p + c2[2] * (1 - p)),
    ];
  }
  throw new Error(`Unsupported CSS color in test: ${css}`);
};

const srgbLin = (v: number) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const contrastRatio = (
  a: [number, number, number],
  b: [number, number, number],
) => {
  const la = 0.2126 * srgbLin(a[0]) + 0.7152 * srgbLin(a[1]) +
    0.0722 * srgbLin(a[2]);
  const lb = 0.2126 * srgbLin(b[0]) + 0.7152 * srgbLin(b[1]) +
    0.0722 * srgbLin(b[2]);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

const extractColorProp = (style: string) =>
  style.match(/(?:^|;)color:([^;]+)/)?.[1] ?? "";

Deno.test("suggestion and quick-reply button text maintains high WCAG contrast across dark, vivid, and pastel primaries", () => {
  const darkSurface: [number, number, number] = [26, 26, 26];
  const lightSurface: [number, number, number] = [246, 244, 238];

  const findSceneDark = resolveCssRgb(
    extractColorProp(
      suggestedMessageButtonStyle(true, {
        primary: "#311d2b",
        background: "#1a1a1a",
      }),
    ),
  );
  assertEquals(
    contrastRatio(findSceneDark, darkSurface) >= 7,
    true,
    `Expected >= 7:1 contrast for #311d2b in dark mode, got ${
      contrastRatio(findSceneDark, darkSurface).toFixed(2)
    }`,
  );

  const nearBlackDark = resolveCssRgb(
    extractColorProp(
      suggestedMessageButtonStyle(true, { primary: "#181715" }),
    ),
  );
  assertEquals(contrastRatio(nearBlackDark, darkSurface) >= 7, true);

  const defaultDarkRgb = resolveCssRgb(
    extractColorProp(suggestedMessageButtonStyle(true)),
  );
  assertEquals(contrastRatio(defaultDarkRgb, darkSurface) >= 7, true);

  const pastelLight = resolveCssRgb(
    extractColorProp(
      suggestedMessageButtonStyle(false, { primary: "#fde047" }),
    ),
  );
  assertEquals(
    contrastRatio(pastelLight, lightSurface) >= 5.5,
    true,
    `Expected >= 5.5:1 contrast for #fde047 in light mode, got ${
      contrastRatio(pastelLight, lightSurface).toFixed(2)
    }`,
  );

  const greenLight = resolveCssRgb(
    extractColorProp(
      suggestedMessageButtonStyle(false, { primary: "#16a34a" }),
    ),
  );
  assertEquals(contrastRatio(greenLight, lightSurface) >= 5.5, true);
});
