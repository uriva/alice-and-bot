import { secretsInText } from "@uri/silly-nlp";

const prefixLength = 4;

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const splitPrefix = (secret: string) =>
  secret.length <= prefixLength + 2 ? { prefix: "", hidden: secret } : {
    prefix: secret.slice(0, prefixLength),
    hidden: secret.slice(prefixLength),
  };

const blurredSecretHtml = (secret: string) => {
  const { prefix, hidden } = splitPrefix(secret);
  return `<span class="secret-blur" title="Sensitive value — hover to reveal">${
    prefix ? `<span class="secret-prefix">${escapeHtml(prefix)}</span>` : ""
  }<span class="secret-hidden">${escapeHtml(hidden)}</span></span>`;
};

const withSecretsBlurred = (text: string) =>
  secretsInText(text)
    .reverse()
    .reduce(
      (result, { start, end }) =>
        result.slice(0, start) + blurredSecretHtml(result.slice(start, end)) +
        result.slice(end),
      text,
    );

const tagOrText = /(<[^>]+>)/;

export const blurSecretsInHtml = (html: string) =>
  html
    .split(tagOrText)
    .map((part) => (part.startsWith("<") ? part : withSecretsBlurred(part)))
    .join("");

export const secretBlurCss = (isDark: boolean) => `
.secret-blur{border-radius:4px;padding:0 3px;cursor:default;background:${
  isDark ? "#ffffff14" : "#0000000d"
}}
.secret-blur .secret-prefix{font-family:inherit;opacity:.85}
.secret-blur .secret-hidden{filter:blur(4px);transition:filter .15s ease;user-select:none;-webkit-user-select:none}
.secret-blur:hover .secret-hidden{filter:blur(0);user-select:text;-webkit-user-select:text}
`;
