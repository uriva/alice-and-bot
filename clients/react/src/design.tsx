import type { JSX } from "preact";
import { useDarkMode } from "./hooks.ts";

export type CustomColors = {
  background?: string;
  text?: string;
  primary?: string;
  hideTitle?: boolean;
  hideOwnAvatar?: boolean;
  hideOtherBubble?: boolean;
  hideNames?: boolean;
  inputMaxWidth?: string;
  chatMaxWidth?: string;
  inputBackground?: string;
};

export const widgetColors = (isDarkMode: boolean, custom?: CustomColors) => ({
  background: custom?.background ?? (isDarkMode ? "#22232a" : "#fff"),
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

const participantColors = [
  { h: 195, s: 65 }, // blue
  { h: 105, s: 65 }, // green
  { h: 30, s: 65 }, // orange
  { h: 300, s: 65 }, // magenta
  { h: 270, s: 65 }, // purple
  { h: 0, s: 65 }, // red
  { h: 210, s: 65 }, // another blue
  { h: 150, s: 65 }, // teal-green
];

export const stringToColor = (str: string, isDarkMode: boolean) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const color = participantColors[Math.abs(hash) % participantColors.length];
  const lightness = isDarkMode ? 32 : 70;
  return `hsl(${color.h}, ${color.s}%, ${lightness}%)`;
};

export const isLightColor = (hsl: string) => {
  const match = hsl.match(/hsl\(\d+, *\d+%, *(\d+)%\)/);
  if (!match) return false;
  const lightness = parseInt(match[1], 10);
  return lightness > 60;
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
