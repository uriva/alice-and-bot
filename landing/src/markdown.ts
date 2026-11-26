import { html, type TemplateResult } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { marked } from "marked";
import hljs from "highlight.js/lib/core";
import typescript from "highlight.js/lib/languages/typescript";

hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("javascript", typescript);
hljs.registerLanguage("json", typescript);

marked.setOptions({
  gfm: true,
  breaks: false,
});

const highlightCode = (code: string, lang: string | undefined) =>
  lang && hljs.getLanguage(lang)
    ? hljs.highlight(code, { language: lang }).value
    : code;

const proseClasses = `
  [&_h1]:text-3xl [&_h1]:sm:text-4xl [&_h1]:font-extrabold [&_h1]:tracking-[-0.03em] [&_h1]:mt-2 [&_h1]:mb-6 [&_h1]:text-[#181715] dark:[&_h1]:text-[#f3f1ea] [&_h1]:border-b [&_h1]:border-[#ece8df] dark:[&_h1]:border-[#24231f] [&_h1]:pb-4
  [&_h2]:text-xl [&_h2]:sm:text-2xl [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:mt-10 [&_h2]:mb-4 [&_h2]:text-[#181715] dark:[&_h2]:text-[#f3f1ea] [&_h2]:scroll-mt-24 [&_h2]:pt-6 [&_h2]:border-t [&_h2]:border-[#ece8df] dark:[&_h2]:border-[#24231f]
  [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-6 [&_h3]:mb-2.5 [&_h3]:text-[#181715] dark:[&_h3]:text-[#f3f1ea]
  [&_h4]:text-base [&_h4]:font-semibold [&_h4]:mt-4 [&_h4]:mb-2 [&_h4]:text-[#181715] dark:[&_h4]:text-[#f3f1ea]
  [&_p]:mb-4 [&_p]:text-[#4a4740] dark:[&_p]:text-[#b8b2a7] [&_p]:leading-relaxed [&_p]:text-[15px]
  [&_a]:text-[#39587f] dark:[&_a]:text-[#7da2cf] [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-[#181715] dark:hover:[&_a]:text-[#f3f1ea]
  [&_img]:rounded-xl [&_img]:my-6 [&_img]:w-full [&_img]:border [&_img]:border-[#e7e4dc] dark:[&_img]:border-[#252420]
  [&_pre]:bg-[#faf9f5] dark:[&_pre]:bg-[#141412] [&_pre]:rounded-xl [&_pre]:p-4 [&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:text-sm [&_pre]:border [&_pre]:border-[#e7e4dc] dark:[&_pre]:border-[#262521] [&_pre]:text-[#181715] dark:[&_pre]:text-[#e7e5df]
  [&_code]:bg-[#f2efe8] dark:[&_code]:bg-[#22211d] [&_code]:text-[#181715] dark:[&_code]:text-[#f3f1ea] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[13px] [&_code]:font-mono
  [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:rounded-none [&_pre_code]:text-sm
  [&_table]:w-full [&_table]:text-left [&_table]:border-collapse [&_table]:my-5
  [&_thead]:border-b [&_thead]:border-[#e7e4dc] dark:[&_thead]:border-[#252420]
  [&_th]:py-2.5 [&_th]:px-3.5 [&_th]:text-[#181715] dark:[&_th]:text-[#f3f1ea] [&_th]:bg-[#faf9f5] dark:[&_th]:bg-[#1a1916] [&_th]:font-semibold [&_th]:text-sm
  [&_td]:py-2.5 [&_td]:px-3.5 [&_td]:text-[#4a4740] dark:[&_td]:text-[#b8b2a7] [&_td]:text-sm [&_td]:border-t [&_td]:border-[#ece8df] dark:[&_td]:border-[#24231f]
  [&_ul]:list-disc [&_ul]:list-inside [&_ul]:my-4 [&_ul]:pl-2 [&_ul]:space-y-2
  [&_ol]:list-decimal [&_ol]:list-inside [&_ol]:my-4 [&_ol]:pl-2 [&_ol]:space-y-2
  [&_li]:text-[#4a4740] dark:[&_li]:text-[#b8b2a7] [&_li]:text-[15px] [&_li]:leading-relaxed
  [&_strong]:text-[#181715] dark:[&_strong]:text-[#f3f1ea] [&_strong]:font-semibold
  [&_blockquote]:border-l-2 [&_blockquote]:border-[#cbc6b9] dark:[&_blockquote]:border-[#3a3832] [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:my-4 [&_blockquote]:text-[#66625b] dark:[&_blockquote]:text-[#9c968c]
  [&_hr]:my-8 [&_hr]:border-[#ece8df] dark:[&_hr]:border-[#24231f]
`.replace(/\n/g, " ").trim();

const slugify = (text: string) =>
  text.toLowerCase().replace(/[^\w]+/g, "-").replace(/^-|-$/g, "");

const addHeadingIds = (htmlStr: string) =>
  htmlStr.replace(
    /<h([2-4])>(.*?)<\/h\1>/g,
    (_, level: string, content: string) => {
      const plain = content.replace(/<[^>]*>/g, "");
      return `<h${level} id="${slugify(plain)}">${content}</h${level}>`;
    },
  );

const highlightCodeBlocks = (htmlStr: string) =>
  htmlStr.replace(
    /<pre><code class="language-(\w+)">([\s\S]*?)<\/code><\/pre>/g,
    (_, lang: string, code: string) => {
      const decoded = code
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
      return `<pre><code class="language-${lang}">${
        highlightCode(decoded, lang)
      }</code></pre>`;
    },
  );

const postProcess = (htmlStr: string) =>
  highlightCodeBlocks(addHeadingIds(htmlStr));

const stripLeadingHeading = (source: string) =>
  source.replace(/^#\s+[^\n]+\n+/, "");

export const renderMarkdown = (
  source: string,
  options: { stripLeadingH1?: boolean } = {},
): TemplateResult => {
  const input = options.stripLeadingH1 ? stripLeadingHeading(source) : source;
  const raw = marked.parse(input) as string;
  return html`
    <div class="${proseClasses}">${unsafeHTML(postProcess(raw))}</div>
  `;
};
