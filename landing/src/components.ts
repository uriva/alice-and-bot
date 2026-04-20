import { html, type TemplateResult } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import hljs from "highlight.js/lib/core";
import typescript from "highlight.js/lib/languages/typescript";

hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("javascript", typescript);
hljs.registerLanguage("json", typescript);
hljs.registerLanguage("bash", typescript);
hljs.registerLanguage("shell", typescript);

type ButtonVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "ghost"
  | "link";
type ButtonSize = "default" | "sm" | "lg" | "icon";

const variantClasses: Record<ButtonVariant, string> = {
  default:
    "bg-gray-800 hover:bg-gray-900 dark:bg-gray-300 dark:hover:bg-gray-400 text-white dark:text-gray-900",
  secondary:
    "bg-gray-200 hover:bg-gray-300 dark:bg-[#2a2a2a] dark:hover:bg-[#333] text-gray-800 dark:text-gray-200",
  destructive:
    "bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600 text-white",
  outline:
    "border border-gray-300 dark:border-gray-600 bg-transparent hover:bg-gray-100 dark:hover:bg-[#1a1a1a] text-gray-800 dark:text-gray-200",
  ghost:
    "bg-transparent hover:bg-gray-100 dark:hover:bg-[#1a1a1a] text-gray-800 dark:text-gray-200",
  link:
    "bg-transparent underline-offset-4 hover:underline text-gray-800 dark:text-gray-200",
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "h-10 px-4 py-2",
  sm: "h-9 px-3 text-sm",
  lg: "h-11 px-8 text-lg",
  icon: "h-10 w-10",
};

const baseClass =
  "inline-flex items-center justify-center whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer";

export const buttonClass = (
  variant: ButtonVariant = "default",
  size: ButtonSize = "default",
  extra = "",
) =>
  `${baseClass} ${variantClasses[variant]} ${sizeClasses[size]}${
    extra ? " " + extra : ""
  }`;

const truncateStr = (str: string) =>
  str.length <= 10 ? str : `${str.slice(0, 6)}...${str.slice(-4)}`;

export const copyableString = (str: string) => {
  const copy = () =>
    navigator.clipboard.writeText(str).then(() => {
      const el = document.querySelector(`[data-copy-key="${str}"]`);
      if (el) {
        el.textContent = "Copied!";
        setTimeout(() => (el.textContent = "Copy"), 2000);
      }
    });
  return html`
    <span class="inline-flex items-center gap-2 font-mono text-sm">
      <span>${truncateStr(str)}</span>
      <button
        type="button"
        @click="${copy}"
        class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        title="Copy public key"
        data-copy-key="${str}"
      >
        Copy
      </button>
    </span>
  `;
};

const highlight = (code: string, lang: string) =>
  hljs.highlight(code, { language: lang }).value;

const codeBlockBaseClass =
  "bg-gray-100 dark:bg-[#1a1a1a] rounded-lg p-4 my-4 text-sm border border-gray-200 dark:border-gray-700 font-mono text-gray-800 dark:text-gray-200";

const codeBlockHeaderClass =
  "flex items-center justify-between px-4 py-2 bg-gray-200 dark:bg-[#2a2a2a] rounded-t-lg border-b border-gray-300 dark:border-gray-600";

const codeBlockContainerClass =
  "rounded-lg border border-gray-200 dark:border-gray-700 my-4 min-w-0 w-full";

export const inlineCode = (text: string) =>
  html`
    <code
      class="bg-gray-100 dark:bg-[#1a1a1a] text-gray-800 dark:text-gray-200 px-1.5 py-0.5 rounded text-sm font-mono"
    >${text}</code>
  `;

const copyButton = (code: string, id: string) => {
  const copy = () =>
    navigator.clipboard.writeText(code).then(() => {
      const el = document.querySelector(`[data-copy-id="${id}"]`);
      if (el) {
        el.textContent = "Copied!";
        setTimeout(() => (el.textContent = "Copy"), 2000);
      }
    });
  return html`
    <button
      type="button"
      @click="${copy}"
      class="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
      data-copy-id="${id}"
    >
      Copy
    </button>
  `;
};

let copyIdCounter = 0;
const nextCopyId = () => `copy-${++copyIdCounter}`;

export const codeBlock = (
  { code, lang = "typescript", filename }: {
    code: string;
    lang?: string;
    filename?: string;
  },
): TemplateResult => {
  const id = nextCopyId();
  return html`
    <div class="${codeBlockContainerClass}">
      <div class="${codeBlockHeaderClass}">
        <span class="text-xs text-gray-600 dark:text-gray-400 font-mono"
        >${filename || lang}</span>
        ${copyButton(code, id)}
      </div>
      <pre
        class="${codeBlockBaseClass} my-0 rounded-t-none"
        style="margin:0;white-space:pre-wrap;overflow:hidden;overflow-wrap:anywhere;word-break:break-word"
      ><code class="language-${lang}">${unsafeHTML(
        highlight(code, lang),
      )}</code></pre>
    </div>
  `;
};

export const shellCode = (code: string): TemplateResult => {
  const id = nextCopyId();
  return html`
    <div class="${codeBlockContainerClass}">
      <div class="${codeBlockHeaderClass}">
        <span class="text-xs text-gray-600 dark:text-gray-400 font-mono"
        >shell</span>
        ${copyButton(code, id)}
      </div>
      <pre
        class="${codeBlockBaseClass} my-0 rounded-t-none text-gray-700 dark:text-cyan-400"
        style="margin:0;white-space:pre-wrap;overflow:hidden;overflow-wrap:anywhere;word-break:break-word"
      ><code>${code}</code></pre>
    </div>
  `;
};
