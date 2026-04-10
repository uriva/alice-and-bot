import { Marked, type Token, type Tokens } from "marked";
import { isAudioUrl, isVideoUrl, preprocessText } from "./utils.ts";

const monoFont =
  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";

const fencedCodeBlockHtml = (code: string, lang: string, isDark: boolean) => {
  const bg = isDark ? "#0a0a0a" : "#f3f4f6";
  const color = isDark ? "#e5e7eb" : "#111";
  const labelBg = isDark ? "#ffffff1a" : "#0000000f";
  const labelColor = isDark ? "#e5e7eb" : "#111";
  const btnBorder = isDark ? "#2a2a2a" : "#00000020";
  const label = lang
    ? `<span style="position:absolute;top:6px;left:8px;font-size:10px;line-height:1;border-radius:8px;padding:3px 6px;background:${labelBg};color:${labelColor};font-weight:600">${lang.toUpperCase()}</span>`
    : "";
  return `<div dir="ltr" style="position:relative;min-width:0;overflow:hidden" class="fenced-code-wrap"><button data-testid="copy-code-button" type="button" title="Copy" style="position:absolute;top:6px;right:8px;font-size:11px;line-height:1;border-radius:10px;border:1px solid ${btnBorder};padding:4px 8px;background:#111111cc;color:#fff;cursor:pointer;box-shadow:${
    isDark ? "0 2px 6px #0006" : "0 1px 3px #0002"
  };opacity:0;pointer-events:none;transition:opacity .15s ease-in-out;z-index:2">Copy</button><pre style="position:relative;padding:10px 12px;overflow:auto;max-width:100%;box-sizing:border-box;background:${bg};color:${color};border-radius:8px;font-family:${monoFont};font-size:13px"><div style="position:relative;display:inline-block;min-width:max-content">${label}<code>${code}</code></div></pre></div>`;
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
  `.fenced-code-wrap:hover [data-testid="copy-code-button"]{opacity:.95!important;pointer-events:auto!important}`;
