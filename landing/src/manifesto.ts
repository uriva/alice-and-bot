import { html, type TemplateResult } from "lit";
import { renderMarkdown } from "./markdown.ts";
import { header } from "./header.ts";
import { siteFooter } from "./footer.ts";
import { buttonClass } from "./components.ts";
import { copyToClipboard } from "../../lit/components/utils.ts";
import { useClearViewportStyles } from "./clear-viewport-styles.ts";
import manifestoText from "./manifesto.md?raw";
import { baseUrl } from "../../protocol/src/clientApi.ts";
import { manifestoPath } from "./paths.ts";

const manifestoUrl = `${baseUrl}${manifestoPath}`;

const shareText = encodeURIComponent(
  "Check out the Alice&Bot Manifesto! It's time to unbreak chat for the AI era.",
);
const shareUrl = encodeURIComponent(manifestoUrl);

const showToast = (message: string) => {
  const el = Object.assign(document.createElement("div"), {
    textContent: message,
    style:
      "position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#181715;color:#faf9f5;padding:8px 20px;border-radius:999px;z-index:9999;font-size:13px;font-weight:500;transition:opacity 0.3s",
  });
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 300);
  }, 2000);
};

const handleCopy = async () => {
  try {
    if (await copyToClipboard(manifestoUrl)) {
      showToast("Link copied to clipboard!");
    } else {
      showToast("Failed to copy link");
    }
  } catch (_e) {
    showToast("Failed to copy link");
  }
};

export const manifesto = (): TemplateResult => {
  useClearViewportStyles();
  return html`
    ${header()}
    <main
      class="surface-dots min-h-screen text-[#181715] dark:text-[#f3f1ea] pt-12 sm:pt-16 flex flex-col"
    >
      <div class="max-w-3xl mx-auto w-full px-4 sm:px-6 flex-1 flex flex-col gap-8">
        <section>
          <p
            class="text-xs font-mono uppercase tracking-wider text-[#66625b] dark:text-[#9c968c] mb-3"
          >
            Manifesto
          </p>
          <h1
            class="text-3xl sm:text-5xl font-extrabold tracking-[-0.035em] leading-[1.08] mb-5"
          >
            The Alice&Bot Manifesto
          </h1>
          <div class="flex flex-wrap gap-2.5">
            <a
              href="${`https://twitter.com/intent/tweet?url=${shareUrl}&text=${shareText}`}"
              target="_blank"
              rel="noopener noreferrer"
              class="${buttonClass("secondary", "sm")}"
            >Share on X</a>
            <a
              href="${`https://www.linkedin.com/shareArticle?mini=true&url=${shareUrl}&title=${shareText}`}"
              target="_blank"
              rel="noopener noreferrer"
              class="${buttonClass("secondary", "sm")}"
            >Share on LinkedIn</a>
            <button
              type="button"
              class="${buttonClass("outline", "sm")}"
              @click="${handleCopy}"
            >
              Copy Link
            </button>
          </div>
        </section>

        <article
          class="bg-white dark:bg-[#151513] rounded-2xl border border-[#e7e4dc] dark:border-[#252420] shadow-[0_1px_2px_rgba(24,23,21,0.04)] px-6 py-8 sm:px-10 sm:py-10"
        >
          ${renderMarkdown(manifestoText, { stripLeadingH1: true })}
        </article>
      </div>
      ${siteFooter()}
    </main>
  `;
};
