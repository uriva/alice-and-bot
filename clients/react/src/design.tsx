export const chatContainerStyle = (isDarkMode: boolean) => ({
  border: "1px solid #ccc",
  padding: 8,
  display: "flex",
  flexDirection: "column",
  background: isDarkMode ? "#22232a" : "#fff",
  color: isDarkMode ? "#f4f4f4" : "#222",
  borderColor: isDarkMode ? "#393a44" : "#ccc",
  transition: "background 0.2s, color 0.2s, border-color 0.2s",
});

export const messageContainerStyle = (isDarkMode: boolean) => ({
  display: "flex",
  flexGrow: 1,
  overflowY: "auto",
  scrollbarGutter: "stable",
  gap: 8,
  background: isDarkMode ? "#282a36" : "#f9fafb",
  transition: "background 0.2s",
  flexDirection: "column-reverse",
});

export const loadingStyle = { fontSize: 12, color: "#bbb" };

export const stringToColor = (str: string, isDarkMode: boolean) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  const lightness = isDarkMode ? 32 : 70;
  return `hsl(${h}, 60%, ${lightness}%)`;
};

export const isLightColor = (hsl: string) => {
  const match = hsl.match(/hsl\(\d+, *\d+%, *(\d+)%\)/);
  if (!match) return false;
  const lightness = parseInt(match[1], 10);
  return lightness > 60;
};
