import type { CustomColors } from "./types.ts";

const chatBackgroundPattern = (isDarkMode: boolean) =>
  `url("data:image/svg+xml,%3Csvg width='180' height='180' viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3Cpattern id='p' x='0' y='0' width='36' height='36' patternUnits='userSpaceOnUse'%3E%3Ccircle cx='18' cy='18' r='1' fill='${
    isDarkMode ? "%231f1e1b" : "%23e2ded3"
  }'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width='180' height='180' fill='${
    isDarkMode ? "%230c0c0b" : "%23f6f4ee"
  }'/%3E%3Crect width='180' height='180' fill='url(%23p)'/%3E%3C/svg%3E")`;

export const widgetColors = (isDarkMode: boolean, custom?: CustomColors) => ({
  background: custom?.background ?? chatBackgroundPattern(isDarkMode),
  backgroundColor: custom?.background ?? (isDarkMode ? "#0c0c0b" : "#f6f4ee"),
  color: custom?.text ?? (isDarkMode ? "#f3f1ea" : "#181715"),
});

export const chatContainerStyle = (
  isDarkMode: boolean,
  custom?: CustomColors,
) => {
  const w = widgetColors(isDarkMode, custom);
  return [
    "position:relative",
    "display:flex",
    "overflow:hidden",
    "flex-direction:column",
    "flex-grow:1",
    "min-height:0",
    "min-width:0",
    "transition:background 0.2s,color 0.2s,border-color 0.2s",
    `background:${w.background}`,
    `background-color:${w.backgroundColor}`,
    `color:${w.color}`,
  ].join(";");
};

export const contentMaxWidthStyle = (custom?: CustomColors) =>
  `max-width:${
    custom?.chatMaxWidth || "860px"
  };margin:0 auto;width:100%;box-sizing:border-box`;

export const loadingStyle = "font-size:12px;color:#9c968c";

export const centerFillStyle = (isDarkMode: boolean) =>
  `display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;text-align:center;color:${
    isDarkMode ? "#9c968c" : "#78736a"
  }`;

export const defaultOtherBubble = (isDark: boolean) =>
  isDark ? "#171614" : "#ffffff";

export const primaryHue = 215;
const avatarHues = [primaryHue, 16, 36, 258, 342, 198, 28, 236];

const hashString = (str: string) =>
  Array.from(str).reduce(
    (hash, ch) => ch.charCodeAt(0) + ((hash << 5) - hash),
    0,
  );

export const avatarColor = (str: string, isDark: boolean) => {
  const h = avatarHues[Math.abs(hashString(str)) % avatarHues.length];
  return `hsl(${h}, ${isDark ? 48 : 44}%, ${isDark ? 56 : 42}%)`;
};

const hexLightness = (hex: string) => {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 510;
};

export const isLightColor = (color: string, isDark?: boolean) => {
  if (color === "var(--widget-start-button-bg)") return isDark === true;
  const hslMatch = color.match(/hsl\(\d+, *\d+%, *(\d+)%\)/);
  if (hslMatch) return parseInt(hslMatch[1], 10) > 60;
  if (color.startsWith("#")) return hexLightness(color) > 0.6;
  return false;
};

export const defaultPrimary = (isDark: boolean) =>
  isDark ? `hsl(${primaryHue}, 34%, 28%)` : `hsl(${primaryHue}, 38%, 36%)`;

export const attachmentPrimaryColor = (
  isDark: boolean,
  customColors?: CustomColors,
) => customColors?.primary ?? defaultPrimary(isDark);

export const messageBubbleColor = (
  { isOwn, isDark, customColors }: {
    isOwn: boolean;
    isDark: boolean;
    customColors: CustomColors | undefined;
  },
) =>
  isOwn
    ? (customColors?.primary ?? defaultPrimary(isDark))
    : (customColors?.otherBubble ?? defaultOtherBubble(isDark));

export const messageParticipantColor = (
  { isGroupChat, isDark, customColors, authorId }: {
    isGroupChat: boolean;
    isDark: boolean;
    customColors: CustomColors | undefined;
    authorId: string;
  },
) => {
  const primary = customColors?.primary ?? defaultPrimary(isDark);
  return !isGroupChat ? primary : avatarColor(authorId, isDark);
};

export const quoteBarColor = (
  isDark: boolean,
  customColors?: CustomColors,
) => customColors?.primary ?? defaultPrimary(isDark);

export const shouldShowAvatar = (
  { isStartOfSequence, isOwn, isGroupChat }: {
    isStartOfSequence: boolean;
    isOwn: boolean;
    isGroupChat: boolean;
  },
) => isStartOfSequence && !isOwn && isGroupChat;

export const shouldShowName = (
  { isStartOfSequence, isOwn, isGroupChat, hideNames }: {
    isStartOfSequence: boolean;
    isOwn: boolean;
    isGroupChat: boolean;
    hideNames: boolean | undefined;
  },
) => isStartOfSequence && !isOwn && !hideNames && isGroupChat;

export const titleStyle = (isDark: boolean, custom?: CustomColors) => {
  if (custom?.primary) {
    return `display:flex;align-items:center;justify-content:center;font-weight:600;padding:12px 0;font-size:15px;letter-spacing:-0.01em;background:${custom.primary};color:${
      isLightColor(custom.primary, isDark) ? "#222" : "#fff"
    };transition:background 0.2s,color 0.2s`;
  }
  const bg = isDark ? "#141412" : "#faf9f5";
  const fg = isDark ? "#f3f1ea" : "#181715";
  const border = isDark ? "rgba(255,255,255,0.07)" : "rgba(24,23,21,0.08)";
  return `display:flex;align-items:center;justify-content:center;font-weight:600;padding:12px 0;font-size:15px;letter-spacing:-0.01em;background:${bg};color:${fg};border-bottom:1px solid ${border};transition:background 0.2s,color 0.2s,border-color 0.2s`;
};

export const emptySuggestionsWrapStyle =
  "max-width:680px;width:100%;padding:20px 12px;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;gap:20px";

export const emptyHeadingStyle = (isDark: boolean, textColor?: string) =>
  `font-size:15px;font-weight:500;line-height:1.5;max-width:520px;color:${
    textColor ?? (isDark ? "#d6d3cb" : "#57534e")
  }`;

export const suggestedGridStyle =
  "display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px;width:100%";

const parseHexRgb = (hex: string): [number, number, number] | null => {
  const raw = hex.replace("#", "").trim();
  if (!/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(raw)) return null;
  const full = raw.length === 3
    ? raw[0] + raw[0] + raw[1] + raw[1] + raw[2] + raw[2]
    : raw;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
};

const hslChannel = (h: number, s: number, l: number) => (n: number) => {
  const k = (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
};

const hslToRgb = (
  h: number,
  s: number,
  l: number,
): [number, number, number] => [
  hslChannel(h, s / 100, l / 100)(0),
  hslChannel(h, s / 100, l / 100)(8),
  hslChannel(h, s / 100, l / 100)(4),
];

const rgbToHsl = ([r255, g255, b255]: [number, number, number]) => {
  const r = r255 / 255;
  const g = g255 / 255;
  const b = b255 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l: l * 100 };
  const s = d / (1 - Math.abs(2 * l - 1));
  const rawHue = max === r
    ? ((g - b) / d + (g < b ? 6 : 0))
    : max === g
    ? ((b - r) / d + 2)
    : ((r - g) / d + 4);
  return { h: Math.round(rawHue * 60) % 360, s: s * 100, l: l * 100 };
};

const parseCssHsl = (
  color: string,
): { h: number; s: number; l: number } | null => {
  const trimmed = color.trim();
  if (trimmed.startsWith("#")) {
    const rgb = parseHexRgb(trimmed);
    return rgb ? rgbToHsl(rgb) : null;
  }
  const hslMatch = trimmed.match(
    /^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/i,
  );
  if (hslMatch) {
    return {
      h: ((Number(hslMatch[1]) % 360) + 360) % 360,
      s: Number(hslMatch[2]),
      l: Number(hslMatch[3]),
    };
  }
  const rgbMatch = trimmed.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i,
  );
  return rgbMatch
    ? rgbToHsl([
      Number(rgbMatch[1]),
      Number(rgbMatch[2]),
      Number(rgbMatch[3]),
    ])
    : null;
};

const linearChannel = (c255: number) => {
  const c = c255 / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const relativeLuminance = ([r, g, b]: [number, number, number]) =>
  0.2126 * linearChannel(r) +
  0.7152 * linearChannel(g) +
  0.0722 * linearChannel(b);

const wcagContrast = (
  a: [number, number, number],
  b: [number, number, number],
) => {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

const fitContrastLightness = (
  h: number,
  s: number,
  l: number,
  isDark: boolean,
): number => {
  const bg: [number, number, number] = isDark ? [34, 34, 34] : [236, 240, 238];
  const target = isDark ? 7 : 5.5;
  if (wcagContrast(hslToRgb(h, s, l), bg) >= target) return l;
  if (isDark && l >= 96) return 96;
  if (!isDark && l <= 12) return 12;
  return fitContrastLightness(h, s, isDark ? l + 2 : l - 2, isDark);
};

const suggestionAccentColor = (primary: string, isDark: boolean) => {
  const parsed = parseCssHsl(primary);
  if (!parsed) return primary;
  const sat = parsed.s < 6
    ? 0
    : Math.round(Math.min(76, Math.max(parsed.s, 38)));
  const light = isDark
    ? Math.round(Math.min(72, Math.max(parsed.l, 60)))
    : Math.round(Math.min(48, Math.max(parsed.l, 32)));
  return `hsl(${parsed.h}, ${sat}%, ${light}%)`;
};

export const suggestionTextColor = (primary: string, isDark: boolean) => {
  const parsed = parseCssHsl(primary);
  if (!parsed) {
    return isDark
      ? `color-mix(in srgb, ${primary} 25%, #f3f1ea)`
      : `color-mix(in srgb, ${primary} 45%, #181715)`;
  }
  const sat = parsed.s < 6 ? 0 : Math.round(
    isDark
      ? Math.min(72, Math.max(parsed.s, 38))
      : Math.min(80, Math.max(parsed.s, 38)),
  );
  const initialL = isDark
    ? Math.min(88, Math.max(parsed.l, 78))
    : Math.max(16, Math.min(parsed.l, 30));
  const finalL = Math.round(
    fitContrastLightness(parsed.h, sat, initialL, isDark),
  );
  return `hsl(${parsed.h}, ${sat}%, ${finalL}%)`;
};

export const suggestionBorderColor = (primary: string, isDark: boolean) => {
  const accent = suggestionAccentColor(primary, isDark);
  return isDark
    ? `color-mix(in srgb, ${accent} 45%, rgba(255,255,255,0.14))`
    : `color-mix(in srgb, ${accent} 34%, transparent)`;
};

const suggestionSurfaceBase = (isDark: boolean, custom?: CustomColors) =>
  custom?.inputBackground && custom.inputBackground !== "transparent"
    ? custom.inputBackground
    : isDark
    ? "rgba(255,255,255,0.04)"
    : "rgba(255,255,255,0.88)";

export const suggestedMessageButtonStyle = (
  isDark: boolean,
  custom?: CustomColors,
) => {
  const primary = custom?.primary ?? defaultPrimary(isDark);
  const accent = suggestionAccentColor(primary, isDark);
  return [
    "padding:12px 15px",
    "border-radius:14px",
    `border:1px solid ${suggestionBorderColor(primary, isDark)}`,
    `background:color-mix(in srgb, ${accent} ${isDark ? "14%" : "8%"}, ${
      suggestionSurfaceBase(isDark, custom)
    })`,
    `color:${suggestionTextColor(primary, isDark)}`,
    `box-shadow:${
      isDark ? "0 1px 2px rgba(0,0,0,0.25)" : "0 1px 2px rgba(24,23,21,0.04)"
    }`,
    "font-size:13.5px",
    "font-weight:500",
    "line-height:1.4",
    "text-align:start",
    "cursor:pointer",
    "font-family:inherit",
    "transition:transform 0.14s ease,border-color 0.14s ease,filter 0.14s ease",
  ].join(";");
};

export const quickReplyButtonStyle = (
  isDark: boolean,
  primary = defaultPrimary(isDark),
) => {
  const accent = suggestionAccentColor(primary, isDark);
  return [
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    "padding:6px 14px",
    "margin:4px 4px 4px 0",
    "border-radius:18px",
    `border:1px solid ${suggestionBorderColor(primary, isDark)}`,
    `background:color-mix(in srgb, ${accent} ${
      isDark ? "16%" : "10%"
    }, transparent)`,
    `color:${suggestionTextColor(primary, isDark)}`,
    "font-size:13px",
    "font-weight:500",
    "cursor:pointer",
    "line-height:1.4",
    "transition:all .15s ease",
    "-webkit-tap-highlight-color:transparent",
  ].join(";");
};
