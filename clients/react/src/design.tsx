import type { JSX } from "preact";
import { useDarkMode } from "./hooks.ts";

export const widgetColors = (isDarkMode: boolean) => ({
  background: isDarkMode ? "#22232a" : "#fff",
  color: isDarkMode ? "#f4f4f4" : "#222",
});

export const chatContainerStyle = (isDarkMode: boolean) => ({
  position: "relative",
  display: "flex",
  overflow: "hidden",
  flexDirection: "column",
  flexGrow: 1,
  ...widgetColors(isDarkMode),
  transition: "background 0.2s, color 0.2s, border-color 0.2s",
});

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

const spinnerStyle = (isDark: boolean): JSX.CSSProperties => ({
  width: 40,
  height: 40,
  border: `4px solid ${isDark ? "#ffffff1a" : "#00000010"}`,
  borderTop: `4px solid ${isDark ? "#2563eb" : "#3182ce"}`,
  borderRadius: "50%",
  animation: "spin 1s linear infinite",
});

export const Spinner = () => {
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
      <div style={spinnerStyle(isDark)} />
    </>
  );
};
