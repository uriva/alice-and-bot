export const chatContainerStyle = (isDarkMode: boolean) => ({
  border: "1px solid #ccc",
  display: "flex",
  overflow: "hidden",
  flexDirection: "column",
  background: isDarkMode ? "#22232a" : "#fff",
  color: isDarkMode ? "#f4f4f4" : "#222",
  borderColor: isDarkMode ? "#393a44" : "#ccc",
  transition: "background 0.2s, color 0.2s, border-color 0.2s",
});

export const loadingStyle = { fontSize: 12, color: "#bbb" };

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
