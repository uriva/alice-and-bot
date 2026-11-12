import { html, type TemplateResult } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import hljs from "highlight.js/lib/core";
import typescript from "highlight.js/lib/languages/typescript";
import { copyToClipboard } from "../../lit/components/utils.ts";

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
    "bg-[#181715] hover:bg-[#2b2926] dark:bg-[#f3f1ea] dark:hover:bg-white text-[#faf9f5] dark:text-[#181715]",
  secondary:
    "bg-[#eae7de] hover:bg-[#dfd9cc] dark:bg-[#24231f] dark:hover:bg-[#2e2d28] text-[#181715] dark:text-[#f3f1ea]",
  destructive:
    "bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600 text-white",
  outline:
    "border border-[#d6d2c7] dark:border-[#32302b] bg-transparent hover:bg-[#efede6] dark:hover:bg-[#1c1b18] text-[#181715] dark:text-[#f3f1ea]",
  ghost:
    "bg-transparent hover:bg-[#efede6] dark:hover:bg-[#1c1b18] text-[#181715] dark:text-[#f3f1ea]",
  link:
    "bg-transparent underline-offset-4 hover:underline text-[#57534e] dark:text-[#a8a298] hover:text-[#181715] dark:hover:text-[#f3f1ea]",
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "h-10 px-4 py-2",
  sm: "h-9 px-3 text-sm",
  lg: "h-11 px-7 text-base",
  icon: "h-10 w-10",
};

const baseClass =
  "inline-flex items-center justify-center whitespace-nowrap rounded-full font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8c867c] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer";

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
  const copy = async () => {
    try {
      if (!(await copyToClipboard(str))) return;
      const el = document.querySelector(`[data-copy-key="${str}"]`);
      if (el) {
        el.textContent = "Copied!";
        setTimeout(() => (el.textContent = "Copy"), 2000);
      }
    } catch (e) {
      console.error("Failed to copy string", e);
    }
  };
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
  "bg-[#faf9f5] dark:bg-[#141412] rounded-xl p-4 my-4 text-sm border border-[#e7e4dc] dark:border-[#262521] font-mono text-[#181715] dark:text-[#e7e5df]";

const codeBlockHeaderClass =
  "flex items-center justify-between px-4 py-2.5 bg-[#efede6] dark:bg-[#1c1b18] rounded-t-xl border-b border-[#e3dfd4] dark:border-[#292824]";

const codeBlockContainerClass =
  "rounded-xl border border-[#e7e4dc] dark:border-[#262521] my-4 min-w-0 w-full overflow-hidden";

export const inlineCode = (text: string) =>
  html`
    <code
      class="bg-gray-100 dark:bg-[#1a1a1a] text-gray-800 dark:text-gray-200 px-1.5 py-0.5 rounded text-sm font-mono"
    >${text}</code>
  `;

const copyButton = (code: string, id: string) => {
  const copy = async () => {
    try {
      if (!(await copyToClipboard(code))) return;
      const el = document.querySelector(`[data-copy-id="${id}"]`);
      if (el) {
        el.textContent = "Copied!";
        setTimeout(() => (el.textContent = "Copy"), 2000);
      }
    } catch (e) {
      console.error("Failed to copy code", e);
    }
  };
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
