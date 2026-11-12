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

export const suggestionTextColor = (primary: string, isDark: boolean) =>
  isDark
    ? `color-mix(in srgb, ${primary} 60%, #ffffff)`
    : `color-mix(in srgb, ${primary} 78%, #181715)`;

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
    "border-radius:14px",
    `border:1px solid ${suggestionBorderColor(primary, isDark)}`,
    `background:color-mix(in srgb, ${primary} ${isDark ? "14%" : "8%"}, ${
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
