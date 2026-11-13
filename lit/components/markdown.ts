import { Marked, type Token, type Tokens } from "marked";
import "./chat-video-player.ts";
import { defaultPrimary, quickReplyButtonStyle } from "./design.ts";
import {
  decodeHtmlEntities,
  isAudioUrl,
  isVideoUrl,
  preprocessText,
} from "./utils.ts";
import { blurSecretsInHtml, secretBlurCss } from "./secrets.ts";
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

export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const sanitizeMarkdownUrl = (
  rawUrl: string,
  allowMailto = true,
): string | null => {
  const cleaned = rawUrl.replace(/\p{Cc}+/gu, "").trim();
  if (!cleaned) return null;
  if (cleaned.startsWith("/")) {
    return cleaned.startsWith("//") || cleaned.startsWith("/\\")
      ? null
      : cleaned;
  }
  if (cleaned.startsWith("#") || cleaned.startsWith("?")) {
    return cleaned;
  }
  const compact = cleaned.replace(/\s+/g, "").toLowerCase();
  if (
    compact.startsWith("https://") ||
    compact.startsWith("http://") ||
    (allowMailto && compact.startsWith("mailto:"))
  ) {
    try {
      const parsed = new URL(cleaned);
      const proto = parsed.protocol.toLowerCase();
      if (
        proto === "https:" ||
        proto === "http:" ||
        (allowMailto && proto === "mailto:")
      ) {
        return cleaned;
      }
    } catch {
      return null;
    }
  }
  return null;
};

const sanitizeCssColor = (color: string): string =>
  color.replace(/["'<>\\;{}]/g, "");

const monoFont =
  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";

const rtlChar = /[\u0590-\u08ff\ufb1d-\ufdfd\ufe70-\ufefc]/;

const ltrChar = /[A-Za-z\u00c0-\u02af]/;

export const textDirection = (text: string): "rtl" | "ltr" | "auto" => {
  const rtlMatches = text.match(new RegExp(rtlChar, "g"));
  const ltrMatches = text.match(new RegExp(ltrChar, "g"));
  const rtlCount = rtlMatches ? rtlMatches.length : 0;
  const ltrCount = ltrMatches ? ltrMatches.length : 0;
  if (rtlCount === 0 && ltrCount === 0) return "auto";
  if (rtlCount === 0) return "ltr";
  if (ltrCount === 0) return "rtl";
  if (rtlCount >= ltrCount) return "rtl";
  const rtlIndex = text.search(rtlChar);
  const ltrIndex = text.search(ltrChar);
  return rtlIndex < ltrIndex && rtlCount * 2 >= ltrCount ? "rtl" : "ltr";
};

const highlightCodeSafely = (rawCode: string, lang: string): string => {
  const plain = decodeHtmlEntities(rawCode);
  if (lang && hljs.getLanguage(lang)) {
    try {
      return hljs.highlight(plain, { language: lang }).value;
    } catch {
      return escapeHtml(plain);
    }
  }
  try {
    return hljs.highlightAuto(plain).value;
  } catch {
    return escapeHtml(plain);
  }
};

const fencedCodeBlockHtml = (code: string, lang: string, isDark: boolean) => {
  const bg = isDark ? "#0a0a0a" : "#1e1e1e";
  const color = "#e5e7eb";
  const labelBg = isDark ? "#ffffff1a" : "#2d2d2d";
  const labelColor = "#e5e7eb";
  const btnBorder = isDark ? "#2a2a2a" : "#333";

  const cleanLang = decodeHtmlEntities(lang).trim();
  const highlighted = highlightCodeSafely(code, cleanLang);
  const safeLangLabel = escapeHtml(cleanLang.toUpperCase());

  const label = cleanLang
    ? `<div style="font-size:11px;font-family:${monoFont};color:${labelColor};background:${labelBg};padding:4px 12px;border-top-left-radius:8px;border-top-right-radius:8px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid ${btnBorder}">${safeLangLabel}
<button data-testid="copy-code-button" type="button" title="Copy" style="font-size:11px;line-height:1;border-radius:4px;border:none;background:transparent;color:${labelColor};cursor:pointer;padding:2px 4px;opacity:0.7;transition:opacity .15s">Copy</button>
</div>`
    : `<div style="display:flex;justify-content:flex-end;padding:4px 8px;background:${labelBg};border-top-left-radius:8px;border-top-right-radius:8px;border-bottom:1px solid ${btnBorder}">
<button data-testid="copy-code-button" type="button" title="Copy" style="font-size:11px;line-height:1;border-radius:4px;border:none;background:transparent;color:${labelColor};cursor:pointer;padding:2px 4px;opacity:0.7;transition:opacity .15s">Copy</button>
</div>`;

  return `<div dir="ltr" style="background:${bg};color:${color};border-radius:8px;min-width:0;overflow:hidden;margin-bottom:8px;box-shadow:inset 0 0 0 1px ${
    isDark ? "#ffffff1a" : "#0000001a"
  }" class="fenced-code-wrap hljs">
    ${label}
    <pre style="margin:0;padding:10px 12px;overflow:hidden;max-width:100%;box-sizing:border-box;font-family:${monoFont};font-size:13px;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere"><div style="position:relative;max-width:100%;min-width:0;white-space:inherit;word-break:inherit;overflow-wrap:inherit"><code style="display:block;background:transparent;color:inherit;padding:0;border-radius:0;white-space:inherit;word-break:inherit;overflow-wrap:inherit;max-width:100%;min-width:0">${highlighted}</code></div></pre>
  </div>`;
};

const inlineCodeHtml = (code: string, isDark: boolean) => {
  const bg = isDark ? "#ffffff22" : "#00000012";
  const color = isDark ? "#e5e7eb" : "#111";
  const safeCode = escapeHtml(decodeHtmlEntities(code));
  return `<code style="background:${bg};color:${color};padding:0 4px;border-radius:4px;font-family:${monoFont};font-size:13px;user-select:text;-webkit-user-select:text">${safeCode}</code>`;
};

const videoPlayerHtml = (src: string, isDark: boolean) => {
  const safeSrc = sanitizeMarkdownUrl(src, false);
  if (!safeSrc) return "";
  return `<chat-video-player src="${escapeHtml(safeSrc)}"${
    isDark ? " isdark" : ""
  }></chat-video-player>`;
};

const audioInlineHtml = (src: string) => {
  const safeSrc = sanitizeMarkdownUrl(src, false);
  if (!safeSrc) return "";
  return `<audio src="${
    escapeHtml(safeSrc)
  }" controls preload="metadata" style="display:block;width:100%;margin-top:6px"></audio>`;
};

const createMarked = (textColor: string, isDark: boolean) => {
  const safeTextColor = sanitizeCssColor(textColor);
  const instance = new Marked();
  instance.use({
    gfm: true,
    breaks: true,
    renderer: {
      html({ text }: Tokens.HTML | Tokens.Tag) {
        return escapeHtml(text);
      },
      paragraph(
        this: { parser: { parseInline(t: Token[]): string } },
        { tokens, text }: Tokens.Paragraph,
      ) {
        const direction = textDirection(text);
        return `<span dir="${direction}">${
          this.parser.parseInline(tokens)
        }</span><br><br>`;
      },
      code({ text, lang }: Tokens.Code) {
        return fencedCodeBlockHtml(text, lang ?? "", isDark);
      },
      codespan({ text }: Tokens.Codespan) {
        return inlineCodeHtml(text, isDark);
      },
      image({ href, text, title }: Tokens.Image) {
        const decodedHref = decodeHtmlEntities(href);
        if (text === "video") return videoPlayerHtml(decodedHref, isDark);
        if (text === "audio") return audioInlineHtml(decodedHref);
        const safeSrc = sanitizeMarkdownUrl(decodedHref, false);
        const safeAlt = escapeHtml(decodeHtmlEntities(text));
        if (!safeSrc) return safeAlt;
        const titleAttr = title
          ? ` title="${escapeHtml(decodeHtmlEntities(title))}"`
          : "";
        return `<img src="${
          escapeHtml(safeSrc)
        }" alt="${safeAlt}"${titleAttr} style="display:block;max-width:100%;height:auto;border-radius:8px;margin-top:6px" />`;
      },
      link(
        this: { parser: { parseInline(t: Token[]): string } },
        { href, title, tokens }: Tokens.Link,
      ) {
        const children = this.parser.parseInline(tokens);
        const safeHref = sanitizeMarkdownUrl(decodeHtmlEntities(href), true);
        if (!safeHref) return children;
        if (isVideoUrl(safeHref)) return videoPlayerHtml(safeHref, isDark);
        if (isAudioUrl(safeHref)) return audioInlineHtml(safeHref);
        const titleAttr = title
          ? ` title="${escapeHtml(decodeHtmlEntities(title))}"`
          : "";
        return `<a href="${
          escapeHtml(safeHref)
        }"${titleAttr} target="_blank" rel="noopener noreferrer" style="color:${safeTextColor};text-decoration:underline;overflow-wrap:anywhere;word-break:break-word">${children}</a>`;
      },
      list(
        this: { listitem(t: Tokens.ListItem): string },
        { ordered, items }: Tokens.List,
      ) {
        const tag = ordered ? "ol" : "ul";
        const listType = ordered ? "decimal" : "disc";
        const body = items.map((item) => this.listitem(item)).join("");
        const direction = textDirection(
          items.map((item) => item.text).join(" "),
        );
        return `<${tag} dir="${direction}" style="list-style:${listType};padding-inline-start:1.5em;margin:0 0 8px 0">${body}</${tag}>`;
      },
      listitem(
        this: { parser: { parse(t: Token[]): string } },
        item: Tokens.ListItem,
      ) {
        const rawContent = this.parser.parse(item.tokens).replace(
          /(?:<br\s*\/?>\s*)+$/gi,
          "",
        );
        const content =
          rawContent.startsWith("<span") && rawContent.endsWith("</span>")
            ? rawContent.replace(/^<span\b[^>]*>/i, "").replace(
              /<\/span>$/i,
              "",
            )
            : rawContent;
        const direction = textDirection(item.text);
        return `<li style="margin:2px 0"><span dir="${direction}">${content}</span></li>`;
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

const buttonTagRegex =
  /<button(?:\s+[^>]*\bid=(?:"([^"]*)"|'([^']*)'))?[^>]*>([\s\S]*?)<\/button>|<button(?:\s+[^>]*\bid=(?:"([^"]*)"|'([^']*)'))?[^>]*\btitle=(?:"([^"]*)"|'([^']*)')[^>]*\/?>/gi;

const quickReplyButtonHtml = (
  title: string,
  id: string,
  isDark: boolean,
  primaryColor: string,
) =>
  `<button class="chat-quick-reply-btn" data-button-id="${
    escapeHtml(id)
  }" type="button" style="${
    quickReplyButtonStyle(
      isDark,
      sanitizeCssColor(primaryColor),
    )
  }">${escapeHtml(title)}</button>`;

const processButtons = (
  text: string,
  isDark: boolean,
  primaryColor: string,
  showButtons: boolean,
) => {
  const renderedButtons: string[] = [];
  const textWithoutButtons = text.replace(
    buttonTagRegex,
    (_match, id1Dq, id1Sq, content, id2Dq, id2Sq, titleDq, titleSq) => {
      const id = id1Dq ?? id1Sq ?? id2Dq ?? id2Sq ?? "";
      const rawTitle = content !== undefined
        ? content
        : (titleDq ?? titleSq ?? "");
      const title = rawTitle.replace(/<[^>]+>/g, "").trim();
      if (title && showButtons) {
        renderedButtons.push(
          quickReplyButtonHtml(title, id || title, isDark, primaryColor),
        );
      }
      return "";
    },
  ).replace(/<\/?(?:buttons|quick_replies)[^>]*>/gi, "");

  if (!showButtons) {
    return { text: textWithoutButtons.trim(), buttonsHtml: "" };
  }
  if (renderedButtons.length === 0) return { text, buttonsHtml: "" };
  const buttonsHtml =
    `<div class="chat-quick-replies" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;margin-bottom:4px">${
      renderedButtons.join("")
    }</div>`;
  return { text: textWithoutButtons.trim(), buttonsHtml };
};

const escapeHtmlTags = (text: string) =>
  text.replace(/<(\/?[a-zA-Z!])/g, "&lt;$1");

export const renderMarkdown = (
  text: string,
  textColor: string,
  isDark: boolean,
  primaryColor = defaultPrimary(isDark),
  showButtons = true,
): string => {
  const { text: cleanText, buttonsHtml } = processButtons(
    text,
    isDark,
    primaryColor,
    showButtons,
  );
  const html = createMarked(textColor, isDark).parse(
    escapeHtmlTags(preprocessText(cleanText)),
    { async: false },
  ).trim();

  const trimmedHtml = html.replace(/(?:<br\s*\/?>)+$/gi, "");

  const spanCount = (trimmedHtml.match(/<span\b/g) || []).length;
  const hasOtherBlocks = /<(div|pre|blockquote|ul|ol|table|h[1-6])\b/i.test(
    trimmedHtml,
  );

  const baseHtml =
    spanCount === 1 && !hasOtherBlocks && trimmedHtml.startsWith("<span") &&
      trimmedHtml.endsWith("</span>")
      ? trimmedHtml.replace(/^<span\b[^>]*>/i, "").replace(/<\/span>$/i, "")
      : trimmedHtml;

  return blurSecretsInHtml(baseHtml + buttonsHtml);
};

export const fencedCodeHoverCss =
  `.fenced-code-wrap:hover [data-testid="copy-code-button"]{opacity:1!important;background:#ffffff1a!important}`;

export { secretBlurCss };
