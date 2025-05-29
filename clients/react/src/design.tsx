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

export const stringToColor = (str: string, isDarkMode: boolean) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash * 31 + 137) % 360;
  const s = 70;
  const lightness = isDarkMode ? 32 : 70;
  return `hsl(${h}, ${s}%, ${lightness}%)`;
};

export const isLightColor = (hsl: string) => {
  const match = hsl.match(/hsl\(\d+, *\d+%, *(\d+)%\)/);
  if (!match) return false;
  const lightness = parseInt(match[1], 10);
  return lightness > 60;
};
