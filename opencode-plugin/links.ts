export const markdownLink = ({ label, url }: { label: string; url: string }) =>
  `[${label}](${url})`;

export const newSessionMessage = ({ url }: { url: string }) =>
  `New session started. ${markdownLink({ label: "Open chat", url })}`;

export const switchSessionMessage = (
  { url, code }: { url: string; code: string },
) =>
  `Open this link to start a chat tied to session ${code}: ${
    markdownLink({ label: "Open chat", url })
  }`;
