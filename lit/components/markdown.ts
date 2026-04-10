import { Marked, type Token, type Tokens } from "marked";
import { isAudioUrl, isVideoUrl, preprocessText } from "./utils.ts";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import bash from "highlight.js/lib/languages/bash";
import json from "highlight.js/lib/languages/json";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";

hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("json", json);
hljs.registerLanguage("css", css);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("html", xml);

export const highlightCss = `
.hljs{color:#c9d1d9;background:transparent}
.hljs-doctag,.hljs-keyword,.hljs-meta .hljs-keyword,.hljs-template-tag,.hljs-template-variable,.hljs-type,.hljs-variable.language_{color:#ff7b72}
.hljs-title,.hljs-title.class_,.hljs-title.class_.inherited__,.hljs-title.function_{color:#d2a8ff}
.hljs-attr,.hljs-attribute,.hljs-literal,.hljs-meta,.hljs-number,.hljs-operator,.hljs-variable,.hljs-selector-attr,.hljs-selector-class,.hljs-selector-id{color:#79c0ff}
.hljs-regexp,.hljs-string,.hljs-meta .hljs-string{color:#a5d6ff}
.hljs-built_in,.hljs-symbol{color:#ffa657}
.hljs-comment,.hljs-code,.hljs-formula{color:#8b949e}
.hljs-name,.hljs-quote,.hljs-selector-tag,.hljs-selector-pseudo{color:#7ee787}
.hljs-subst{color:#c9d1d9}
.hljs-section{color:#1f6feb;font-weight:bold}
.hljs-bullet{color:#f2cc60}
.hljs-emphasis{color:#c9d1d9;font-style:italic}
.hljs-strong{color:#c9d1d9;font-weight:bold}
.hljs-addition{color:#aff5b4;background-color:#033a16}
.hljs-deletion{color:#ffdcd7;background-color:#67060c}
`;

const monoFont =
  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";

const fencedCodeBlockHtml = (code: string, lang: string, isDark: boolean) => {
  const bg = isDark ? "#0a0a0a" : "#1e1e1e";
  const color = "#e5e7eb";
  const labelBg = isDark ? "#ffffff1a" : "#2d2d2d";
  const labelColor = "#e5e7eb";
  const btnBorder = isDark ? "#2a2a2a" : "#333";

  let highlighted = code;
  if (lang && hljs.getLanguage(lang)) {
    try {
      highlighted = hljs.highlight(code, { language: lang }).value;
    } catch (_) {
      // fallback
    }
  } else {
    try {
      highlighted = hljs.highlightAuto(code).value;
    } catch (_) {
      // fallback
    }
  }

  const label = lang
    ? `<div style="font-size:11px;font-family:${monoFont};color:${labelColor};background:${labelBg};padding:4px 12px;border-top-left-radius:8px;border-top-right-radius:8px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid ${btnBorder}">${lang.toUpperCase()}
<button data-testid="copy-code-button" type="button" title="Copy" style="font-size:11px;line-height:1;border-radius:4px;border:none;background:transparent;color:${labelColor};cursor:pointer;padding:2px 4px;opacity:0.7;transition:opacity .15s">Copy</button>
</div>`
    : `<div style="display:flex;justify-content:flex-end;padding:4px 8px;background:${labelBg};border-top-left-radius:8px;border-top-right-radius:8px;border-bottom:1px solid ${btnBorder}">
<button data-testid="copy-code-button" type="button" title="Copy" style="font-size:11px;line-height:1;border-radius:4px;border:none;background:transparent;color:${labelColor};cursor:pointer;padding:2px 4px;opacity:0.7;transition:opacity .15s">Copy</button>
</div>`;

  return `<div dir="ltr" style="background:${bg};color:${color};border-radius:8px;min-width:0;overflow:hidden;margin-bottom:8px;box-shadow:inset 0 0 0 1px ${
    isDark ? "#ffffff1a" : "#0000001a"
  }" class="fenced-code-wrap hljs">
    ${label}
    <pre style="margin:0;padding:10px 12px;overflow:auto;max-width:100%;box-sizing:border-box;font-family:${monoFont};font-size:13px"><code style="background:transparent;color:inherit;padding:0;border-radius:0">${highlighted}</code></pre>
  </div>`;
};

const inlineCodeHtml = (code: string, isDark: boolean) => {
  const bg = isDark ? "#ffffff22" : "#00000012";
  const color = isDark ? "#e5e7eb" : "#111";
  return `<code style="background:${bg};color:${color};padding:0 4px;border-radius:4px;font-family:${monoFont};font-size:13px">${code}</code>`;
};

const videoPlayerHtml = (src: string) =>
  `<div style="position:relative"><video src="${src}" controls preload="metadata" playsinline style="display:block;max-width:100%;height:auto;border-radius:8px;margin-top:6px;background:#000"></video></div>`;

const audioInlineHtml = (src: string) =>
  `<audio src="${src}" controls preload="metadata" style="display:block;width:100%;margin-top:6px"></audio>`;

const createMarked = (textColor: string, isDark: boolean) => {
  const instance = new Marked();
  instance.use({
    gfm: true,
    breaks: true,
    renderer: {
      paragraph(
        this: { parser: { parseInline(t: Token[]): string } },
        { tokens }: Tokens.Paragraph,
      ) {
        return `<div dir="auto" style="margin:0 0 8px 0">${
          this.parser.parseInline(tokens)
        }</div>`;
      },
      code({ text, lang }: Tokens.Code) {
        return fencedCodeBlockHtml(text, lang ?? "", isDark);
      },
      codespan({ text }: Tokens.Codespan) {
        return inlineCodeHtml(text, isDark);
      },
      image({ href, text }: Tokens.Image) {
        if (text === "video") return videoPlayerHtml(href);
        if (text === "audio") return audioInlineHtml(href);
        return `<img src="${href}" alt="${text}" style="display:block;max-width:100%;height:auto;border-radius:8px;margin-top:6px" />`;
      },
      link(
        this: { parser: { parseInline(t: Token[]): string } },
        { href, tokens }: Tokens.Link,
      ) {
        const children = this.parser.parseInline(tokens);
        if (isVideoUrl(href)) return videoPlayerHtml(href);
        if (isAudioUrl(href)) return audioInlineHtml(href);
        return `<a href="${href}" target="_blank" rel="noopener noreferrer" style="color:${textColor};text-decoration:underline;overflow-wrap:anywhere;word-break:break-word">${children}</a>`;
      },
      list(
        this: { listitem(t: Tokens.ListItem): string },
        { ordered, items }: Tokens.List,
      ) {
        const tag = ordered ? "ol" : "ul";
        const listType = ordered ? "decimal" : "disc";
        const body = items.map((item) => this.listitem(item)).join("");
        return `<${tag} style="list-style:${listType};padding-left:1.5em;margin:0 0 8px 0">${body}</${tag}>`;
      },
      listitem(
        this: { parser: { parse(t: Token[]): string } },
        { tokens }: Tokens.ListItem,
      ) {
        return `<li style="margin:2px 0">${this.parser.parse(tokens)}</li>`;
      },
      table(
        this: { parser: { parseInline(t: Token[]): string } },
        { header, rows }: Tokens.Table,
      ) {
        const headCells = header.map(
          (h: Tokens.TableCell) =>
            `<th>${this.parser.parseInline(h.tokens)}</th>`,
        ).join("");
        const bodyRows = rows.map(
          (row: Tokens.TableCell[]) =>
            `<tr>${
              row.map((cell: Tokens.TableCell) =>
                `<td>${this.parser.parseInline(cell.tokens)}</td>`
              ).join("")
            }</tr>`,
        ).join("");
        return `<div style="overflow:auto;max-width:100%"><table><thead><tr>${headCells}</tr></thead><tbody>${bodyRows}</tbody></table></div>`;
      },
    },
  });
  return instance;
};

const escapeHtmlTags = (text: string) =>
  text.replace(/<(\/?[a-zA-Z])/g, "&lt;$1");

export const renderMarkdown = (
  text: string,
  textColor: string,
  isDark: boolean,
): string =>
  createMarked(textColor, isDark).parse(
    escapeHtmlTags(preprocessText(text)),
    { async: false },
  );

export const fencedCodeHoverCss =
  `.fenced-code-wrap:hover [data-testid="copy-code-button"]{opacity:1!important;background:#ffffff1a!important}`;
