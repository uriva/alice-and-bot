import { html, type TemplateResult } from "lit";
import {
  comparePath,
  docsPath,
  manifestoPath,
  mcpGuidePath,
  privacyPath,
  termsPath,
} from "./paths.ts";

const footerLinkClass =
  "text-[#66625b] dark:text-[#9c968c] hover:text-[#181715] dark:hover:text-[#f3f1ea] transition-colors";

export const siteFooter = (): TemplateResult =>
  html`
    <footer
      class="w-full border-t border-[#e5e1d6] dark:border-[#22211d] mt-12 py-10 bg-[#faf9f5]/70 dark:bg-[#111110]/80"
    >
      <div class="max-w-6xl mx-auto px-4 flex flex-col items-center gap-3">
        <nav class="flex flex-wrap justify-center gap-6 text-sm">
          <a href="${docsPath}" class="${footerLinkClass}">Docs</a>
          <a href="${mcpGuidePath}" class="${footerLinkClass}">MCP</a>
          <a href="${comparePath}" class="${footerLinkClass}">Compare</a>
          <a href="${manifestoPath}" class="${footerLinkClass}">Manifesto</a>
          <a href="${privacyPath}" class="${footerLinkClass}">Privacy Policy</a>
          <a href="${termsPath}" class="${footerLinkClass}">Terms of Service</a>
          <a
            href="https://github.com/uriva/alice-and-bot"
            target="_blank"
            rel="noopener noreferrer"
            class="${footerLinkClass}"
          >GitHub</a>
        </nav>
        <p class="text-xs text-[#8c867c]">
          Open source · Self-hostable · End-to-end encrypted
        </p>
      </div>
    </footer>
  `;
