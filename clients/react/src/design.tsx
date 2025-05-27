export const chatContainerStyle = {
  border: "1px solid #ccc",
  padding: 8,
  maxWidth: 400,
};
export const messageContainerStyle = {
  minHeight: 200,
  maxHeight: 300,
  overflowY: "auto",
  marginBottom: 8,
  display: "flex",
  flexDirection: "column-reverse",
};
const avatarBaseStyle = {
  display: "inline-block",
  width: 28,
  height: 28,
  borderRadius: "50%",
  color: "#222",
  textAlign: "center",
  lineHeight: "28px",
  fontWeight: 700,
  marginRight: 8,
  fontSize: 14,
};
export const loadingStyle = { fontSize: 12, color: "#bbb" };
export const waitingStyle = { color: "red", fontSize: 12 };

export const stringToColor = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 60%, 70%)`;
};

export const isLightColor = (hsl: string) => {
  const match = hsl.match(/hsl\(\d+, *\d+%, *(\d+)%\)/);
  return !match || parseInt(match[1], 10) > 60;
};

export const getAvatar = (publicSignKey: string) => (
  <div style={{ ...avatarBaseStyle, background: stringToColor(publicSignKey) }}>
    {publicSignKey.slice(0, 2).toUpperCase()}
  </div>
);

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
  marginBottom: 2,
  alignSelf: align,
});
