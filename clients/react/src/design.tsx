export const avatarStyle = (bubbleColor: string) => ({
  width: 32,
  height: 32,
  borderRadius: "50%",
  marginRight: 8,
  background: bubbleColor,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
  padding: 4,
  boxSizing: "border-box",
  boxShadow: isDarkMode() ? "0 1px 4px #0004" : "0 1px 4px #0001",
  transition: "background 0.2s, box-shadow 0.2s",
});

export const avatarImgStyle = {
  width: 24,
  height: 24,
  objectFit: "cover",
  borderRadius: "50%",
};

export const avatarTextStyle = (bubbleColor: string) => ({
  color: isLightColor(bubbleColor)
    ? (isDarkMode() ? "#fff" : "#222")
    : (isDarkMode() ? "#fff" : "#fff"),
  fontWeight: 700,
  fontSize: 15,
  letterSpacing: 0.5,
});

export const chatInputStyle = (isDark: boolean) => ({
  flexGrow: 1,
  padding: "12px 16px",
  border: `2px solid ${isDark ? "#2563eb" : "#3182ce"}`,
  borderRadius: 32,
  background: isDark ? "#181c23" : "#f1f5f9",
  color: isDark ? "#f3f4f6" : "#1e293b",
  fontSize: 16,
  outline: "none",
  transition: "border 0.2s, background 0.2s, color 0.2s",
  boxShadow: isDark
    ? "0 2px 8px rgba(0,0,0,0.18)"
    : "0 2px 8px rgba(0,0,0,0.08)",
  fontFamily: "inherit",
  letterSpacing: 0.1,
});

export const sendButtonStyle = (isDark: boolean, enabled: boolean) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 22px 0 16px",
  height: 44,
  borderRadius: 32,
  border: "none",
  background: enabled
    ? (isDark
      ? "linear-gradient(90deg,#2563eb 60%,#60a5fa 100%)"
      : "linear-gradient(90deg,#3182ce 60%,#60a5fa 100%)")
    : (isDark ? "#23272f" : "#cbd5e1"),
  color: enabled ? "#fff" : (isDark ? "#aaa" : "#64748b"),
  fontWeight: 700,
  fontSize: 17,
  cursor: enabled ? "pointer" : "not-allowed",
  boxShadow: isDark
    ? "0 2px 8px rgba(0,0,0,0.18)"
    : "0 2px 8px rgba(0,0,0,0.08)",
  transition: "background 0.2s, color 0.2s, box-shadow 0.2s",
  opacity: enabled ? 1 : 0.7,
  borderTopLeftRadius: 12,
  borderBottomLeftRadius: 12,
  gap: 7,
});

export const sendIconStyle = (enabled: boolean) => ({
  display: "flex",
  alignItems: "center",
  marginRight: 0,
  color: enabled ? "#fff" : "#64748b",
  filter: enabled ? "drop-shadow(0 1px 2px #0002)" : "none",
  opacity: enabled ? 0.95 : 0.7,
  transition: "color 0.2s, filter 0.2s",
});
export const isDarkMode = () =>
  typeof globalThis !== "undefined" &&
  "matchMedia" in globalThis &&
  globalThis.matchMedia("(prefers-color-scheme: dark)").matches;

export const chatContainerStyle = {
  border: "1px solid #ccc",
  padding: 8,
  background: isDarkMode() ? "#1a202c" : "#fff",
  color: isDarkMode() ? "#f3f4f6" : "#222",
  borderColor: isDarkMode() ? "#374151" : "#ccc",
  transition: "background 0.2s, color 0.2s, border-color 0.2s",
};
export const messageContainerStyle = {
  height: 700,
  width: 400,
  overflowY: "auto",
  marginBottom: 8,
  gap: 8,
  display: "flex",
  flexDirection: "column-reverse",
  background: isDarkMode() ? "#111827" : "#f9fafb",
  transition: "background 0.2s",
};

export const loadingStyle = { fontSize: 12, color: "#bbb" };

export const waitingStyle = { color: "red", fontSize: 12 };

export const stringToColor = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  const lightness = isDarkMode() ? 32 : 70;
  return `hsl(${h}, 60%, ${lightness}%)`;
};

export const isLightColor = (hsl: string) => {
  const match = hsl.match(/hsl\(\d+, *\d+%, *(\d+)%\)/);
  if (!match) return false;
  const lightness = parseInt(match[1], 10);
  return lightness > 60;
};

export const bubbleStyle = (
  { bubbleColor, textColor, isOwn, showAvatar, align }: {
    bubbleColor: string;
    textColor: string;
    isOwn: boolean;
    showAvatar: boolean;
    align: "flex-start" | "flex-end";
  },
) => ({
  background: bubbleColor,
  color: textColor,
  borderRadius: 16,
  padding: "6px 12px",
  maxWidth: 220,
  marginLeft: isOwn ? 0 : (!isOwn && showAvatar ? 0 : 36),
  marginRight: isOwn ? (showAvatar ? 0 : 36) : 0,
  alignSelf: align,
});
