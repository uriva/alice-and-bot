import { html, type TemplateResult } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { marked } from "marked";
import hljs from "highlight.js/lib/core";
import typescript from "highlight.js/lib/languages/typescript";

hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("javascript", typescript);
hljs.registerLanguage("json", typescript);
hljs.registerLanguage("bash", typescript);
hljs.registerLanguage("shell", typescript);

marked.setOptions({
  gfm: true,
  breaks: false,
});

const highlightCode = (code: string, lang: string | undefined) =>
  lang && hljs.getLanguage(lang)
    ? hljs.highlight(code, { language: lang }).value
    : code;

const proseClasses = `
  [&_h1]:text-3xl [&_h1]:font-extrabold [&_h1]:mt-4 [&_h1]:mb-6 [&_h1]:text-gray-900 dark:[&_h1]:text-white [&_h1]:border-b [&_h1]:border-gray-200 dark:[&_h1]:border-gray-700 [&_h1]:pb-4
  [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:mt-10 [&_h2]:mb-4 [&_h2]:text-gray-800 dark:[&_h2]:text-gray-200 [&_h2]:scroll-mt-24
  [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:mt-6 [&_h3]:mb-3 [&_h3]:text-gray-700 dark:[&_h3]:text-gray-300
  [&_h4]:text-lg [&_h4]:font-semibold [&_h4]:mt-4 [&_h4]:mb-2 [&_h4]:text-gray-700 dark:[&_h4]:text-gray-300
  [&_p]:mb-4 [&_p]:text-gray-700 dark:[&_p]:text-gray-300 [&_p]:leading-relaxed
  [&_a]:text-blue-600 dark:[&_a]:text-blue-400 [&_a]:underline hover:[&_a]:text-blue-800 dark:hover:[&_a]:text-blue-300
  [&_img]:rounded-xl [&_img]:shadow-lg [&_img]:my-6 [&_img]:w-full [&_img]:border [&_img]:border-gray-200 dark:[&_img]:border-gray-700
  [&_pre]:bg-gray-100 dark:[&_pre]:bg-gray-800 [&_pre]:rounded-lg [&_pre]:p-4 [&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:text-sm [&_pre]:border [&_pre]:border-gray-200 dark:[&_pre]:border-gray-700
  [&_code]:bg-gray-100 dark:[&_code]:bg-gray-800 [&_code]:text-gray-800 dark:[&_code]:text-gray-200 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono
  [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:rounded-none
  [&_table]:w-full [&_table]:text-left [&_table]:border-collapse [&_table]:my-4
  [&_thead]:border-b [&_thead]:border-gray-300 dark:[&_thead]:border-gray-600
  [&_th]:py-2 [&_th]:px-3 [&_th]:text-gray-800 dark:[&_th]:text-gray-200 [&_th]:font-semibold [&_th]:text-sm
  [&_td]:py-2 [&_td]:px-3 [&_td]:text-gray-700 dark:[&_td]:text-gray-300 [&_td]:text-sm [&_td]:border-t [&_td]:border-gray-200 dark:[&_td]:border-gray-700
  [&_ul]:list-disc [&_ul]:list-inside [&_ul]:my-4 [&_ul]:pl-4 [&_ul]:space-y-2
  [&_ol]:list-decimal [&_ol]:list-inside [&_ol]:my-4 [&_ol]:pl-4 [&_ol]:space-y-2
  [&_li]:text-gray-700 dark:[&_li]:text-gray-300
  [&_strong]:text-gray-900 dark:[&_strong]:text-white [&_strong]:font-semibold
  [&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 dark:[&_blockquote]:border-gray-600 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:my-4 [&_blockquote]:text-gray-600 dark:[&_blockquote]:text-gray-400
  [&_hr]:my-8 [&_hr]:border-gray-200 dark:[&_hr]:border-gray-700
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

export const renderMarkdown = (source: string): TemplateResult => {
  const raw = marked.parse(source) as string;
  return html`
    <div class="${proseClasses}">${unsafeHTML(postProcess(raw))}</div>
  `;
};
