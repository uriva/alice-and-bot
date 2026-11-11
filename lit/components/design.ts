import type { CustomColors } from "./types.ts";

const chatBackgroundPattern = (isDarkMode: boolean) =>
  `url("data:image/svg+xml,%3Csvg width='200' height='200' viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3Cpattern id='p' x='0' y='0' width='40' height='40' patternUnits='userSpaceOnUse'%3E%3Ccircle cx='20' cy='20' r='1' fill='${
    isDarkMode ? "%23222" : "%23e8e8e0"
  }'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width='200' height='200' fill='${
    isDarkMode ? "%230a0a0a" : "%23f8f7f4"
  }'/%3E%3Crect width='200' height='200' fill='url(%23p)'/%3E%3C/svg%3E")`;

export const widgetColors = (isDarkMode: boolean, custom?: CustomColors) => ({
  background: custom?.background ?? chatBackgroundPattern(isDarkMode),
  backgroundColor: custom?.background ?? (isDarkMode ? "#0a0a0a" : "#f8f7f4"),
  color: custom?.text ?? (isDarkMode ? "#f4f4f4" : "#222"),
});

export const chatContainerStyle = (
  isDarkMode: boolean,
  custom?: CustomColors,
) =>
  [
    "position:relative",
    "display:flex",
    "overflow:hidden",
    "flex-direction:column",
    "flex-grow:1",
    "min-height:0",
    "min-width:0",
    "transition:background 0.2s,color 0.2s,border-color 0.2s",
    ...(() => {
      const w = widgetColors(isDarkMode, custom);
      return [
        `background:${w.background}`,
        `background-color:${w.backgroundColor}`,
        `color:${w.color}`,
      ];
    })(),
  ].join(";");

export const contentMaxWidthStyle = (custom?: CustomColors) =>
  `max-width:${
    custom?.chatMaxWidth || "900px"
  };margin:0 auto;width:100%;box-sizing:border-box`;

export const loadingStyle = "font-size:12px;color:#bbb";

export const centerFillStyle = (isDarkMode: boolean) =>
  `display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;text-align:center;color:${
    isDarkMode ? "#9ca3af" : "#888"
  }`;

export const defaultOtherBubble = (isDark: boolean) =>
  isDark ? "#1e1e22" : "#ffffff";

export const primaryHue = 170;
const avatarHues = [primaryHue, 105, 30, 300, 270, 0, 210, 150];

export const avatarColor = (str: string, isDark: boolean) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = avatarHues[Math.abs(hash) % avatarHues.length];
  return `hsl(${h}, 65%, ${isDark ? 65 : 35}%)`;
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
  isDark ? `hsl(${primaryHue}, 42%, 24%)` : `hsl(${primaryHue}, 55%, 45%)`;

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
  const primary = custom?.primary ?? defaultPrimary(isDark);
  return `display:flex;align-items:center;justify-content:center;font-weight:bold;padding:12px 0;font-size:16px;background:${primary};color:${
    isLightColor(primary, isDark) ? "#222" : "#fff"
  };transition:background 0.2s,color 0.2s`;
};

export const emptySuggestionsWrapStyle =
  "max-width:680px;width:100%;padding:20px 12px;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;gap:20px";

export const emptyHeadingStyle = (isDark: boolean, textColor?: string) =>
  `font-size:15px;font-weight:500;line-height:1.5;max-width:520px;color:${
    textColor ?? (isDark ? "#cbd5e1" : "#475569")
  }`;

export const suggestedGridStyle =
  "display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px;width:100%";

export const suggestionTextColor = (primary: string, isDark: boolean) =>
  isDark
    ? `color-mix(in srgb, ${primary} 60%, #ffffff)`
    : `color-mix(in srgb, ${primary} 78%, #0f172a)`;

export const suggestionBorderColor = (primary: string, isDark: boolean) =>
  isDark
    ? `color-mix(in srgb, ${primary} 45%, rgba(255,255,255,0.12))`
    : `color-mix(in srgb, ${primary} 32%, transparent)`;

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
  return [
    "padding:12px 15px",
    "border-radius:12px",
    `border:1px solid ${suggestionBorderColor(primary, isDark)}`,
    `background:color-mix(in srgb, ${primary} ${isDark ? "14%" : "8%"}, ${
      suggestionSurfaceBase(isDark, custom)
    })`,
    `color:${suggestionTextColor(primary, isDark)}`,
    `box-shadow:${
      isDark ? "0 1px 2px rgba(0,0,0,0.25)" : "0 1px 2px rgba(0,0,0,0.04)"
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
) =>
  [
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    "padding:6px 14px",
    "margin:4px 4px 4px 0",
    "border-radius:18px",
    `border:1px solid ${suggestionBorderColor(primary, isDark)}`,
    `background:color-mix(in srgb, ${primary} ${
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
