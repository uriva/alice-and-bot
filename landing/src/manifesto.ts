import { html, type TemplateResult } from "lit";
import { renderMarkdown } from "./markdown.ts";
import { header } from "./header.ts";
import { buttonClass } from "./components.ts";
import { useClearViewportStyles } from "./clear-viewport-styles.ts";
import manifestoText from "./manifesto.md?raw";
import { baseUrl } from "../../protocol/src/clientApi.ts";

const manifestoUrl = baseUrl + "/";

const shareText = encodeURIComponent(
  "Check out the Alice&Bot Manifesto! It's time to unbreak chat for the AI era.",
);
const shareUrl = encodeURIComponent(manifestoUrl);

const showToast = (message: string) => {
  const el = Object.assign(document.createElement("div"), {
    textContent: message,
    style:
      "position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:8px 20px;border-radius:8px;z-index:9999;font-size:14px;transition:opacity 0.3s",
  });
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 300);
  }, 2000);
};

const handleCopy = () =>
  navigator.clipboard.writeText(manifestoUrl).then(
    () => showToast("Link copied to clipboard!"),
    () => showToast("Failed to copy link"),
  );

const shareLinkClass =
  "px-4 py-2 rounded-lg bg-gray-100 dark:bg-[#1a1a1a] hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 font-medium text-sm transition-colors";

export const manifesto = (): TemplateResult => {
  useClearViewportStyles();
  return html`
    ${header()}
    <main class="min-h-screen bg-[#f8f7f4] dark:bg-[#0a0a0a] py-12 px-4">
      <div class="max-w-3xl mx-auto">
        <div
          class="bg-white dark:bg-[#111] rounded-2xl shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden"
        >
          <div
            class="bg-gray-800 dark:bg-gray-950 px-6 py-4 border-b border-gray-700 dark:border-gray-800"
          >
            <h1 class="text-2xl font-bold text-white text-center">
              The Alice&Bot Manifesto
            </h1>
          </div>
          <div class="px-6 py-8">
            <div class="flex flex-wrap gap-3 justify-center mb-8">
              <a
                href="${`https://twitter.com/intent/tweet?url=${shareUrl}&text=${shareText}`}"
                target="_blank"
                rel="noopener noreferrer"
                class="${shareLinkClass}"
              >Share on Twitter/X</a>
              <a
                href="${`https://www.linkedin.com/shareArticle?mini=true&url=${shareUrl}&title=${shareText}`}"
                target="_blank"
                rel="noopener noreferrer"
                class="${shareLinkClass}"
              >Share on LinkedIn</a>
              <button type="button" class="${buttonClass(
                "secondary",
                "sm",
              )}" @click="${handleCopy}">
                Copy Link
              </button>
            </div>
            ${renderMarkdown(manifestoText)}
          </div>
        </div>
      </div>
    </main>
  `;
};
