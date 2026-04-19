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

export const primaryHue = 195;
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

export const isLightColor = (color: string) => {
  const hslMatch = color.match(/hsl\(\d+, *\d+%, *(\d+)%\)/);
  if (hslMatch) return parseInt(hslMatch[1], 10) > 60;
  if (color.startsWith("#")) return hexLightness(color) > 0.6;
  return false;
};

export const defaultPrimary = (isDark: boolean) =>
  isDark ? `hsl(${primaryHue}, 45%, 22%)` : "#dbeafe";
