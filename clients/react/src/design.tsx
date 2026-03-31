import type { JSX } from "preact";
import { useDarkMode } from "./hooks.ts";

export type CustomColors = {
  background?: string;
  text?: string;
  primary?: string;
  otherBubble?: string;
  hideTitle?: boolean;
  hideOwnAvatar?: boolean;
  hideOtherBubble?: boolean;
  hideNames?: boolean;
  inputMaxWidth?: string;
  chatMaxWidth?: string;
  inputBackground?: string;
};

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
) => ({
  position: "relative",
  display: "flex",
  overflow: "hidden",
  flexDirection: "column",
  flexGrow: 1,
  minHeight: 0,
  minWidth: 0,
  ...widgetColors(isDarkMode, custom),
  transition: "background 0.2s, color 0.2s, border-color 0.2s",
});

export const contentMaxWidthStyle = (custom?: CustomColors) =>
  custom?.chatMaxWidth
    ? { maxWidth: custom.chatMaxWidth, margin: "0 auto", width: "100%" }
    : {};

export const loadingStyle = { fontSize: 12, color: "#bbb" };

export const centerFillStyle = (isDarkMode: boolean) => ({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  textAlign: "center",
  color: isDarkMode ? "#9ca3af" : "#888",
});

export const defaultOtherBubble = (isDark: boolean) =>
  isDark ? "#1e1e22" : "#ffffff";

const avatarHues = [195, 105, 30, 300, 270, 0, 210, 150];

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

const spinnerStyle = (
  isDark: boolean,
  color?: string,
): JSX.CSSProperties => ({
  width: 40,
  height: 40,
  border: `4px solid ${isDark ? "#ffffff1a" : "#00000010"}`,
  borderTop: `4px solid ${color ?? (isDark ? "#ffffff80" : "#00000040")}`,
  borderRadius: "50%",
  animation: "spin 1s linear infinite",
});

export const Spinner = ({ color }: { color?: string } = {}) => {
  const isDark = useDarkMode();
  return (
    <>
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
      <div style={spinnerStyle(isDark, color)} />
    </>
  );
};

const shimmerKeyframes = `
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
`;

const shimmerStyle = (isDark: boolean): JSX.CSSProperties => ({
  display: "inline-block",
  borderRadius: 4,
  background: isDark
    ? "linear-gradient(90deg, #333 25%, #444 50%, #333 75%)"
    : "linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%)",
  backgroundSize: "200% 100%",
  animation: "shimmer 1.5s ease-in-out infinite",
});

export const ShimmerText = (
  { width = 80, height = 14 }: { width?: number; height?: number } = {},
) => {
  const isDark = useDarkMode();
  return (
    <>
      <style>{shimmerKeyframes}</style>
      <span style={{ ...shimmerStyle(isDark), width, height }} />
    </>
  );
};

export const ShimmerCircle = ({ size = 32 }: { size?: number } = {}) => {
  const isDark = useDarkMode();
  return (
    <>
      <style>{shimmerKeyframes}</style>
      <span
        style={{
          ...shimmerStyle(isDark),
          width: size,
          height: size,
          borderRadius: "50%",
        }}
      />
    </>
  );
};
