import { html, type TemplateResult } from "lit";
import { renderMarkdown } from "./markdown.ts";
import { header } from "./header.ts";
import { siteFooter } from "./footer.ts";
import { useClearViewportStyles } from "./clear-viewport-styles.ts";
import mcpGuideText from "./mcp-guide.md?raw";

export const mcpGuide = (): TemplateResult => {
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
            MCP Server
          </p>
          <h1
            class="text-3xl sm:text-5xl font-extrabold tracking-[-0.035em] leading-[1.08] mb-3"
          >
            Connect any MCP client
          </h1>
          <p class="text-base sm:text-lg text-[#57534e] dark:text-[#a8a298] leading-relaxed">
            Pair your phone with any MCP-compatible agent or app over
            end-to-end encrypted chat.
          </p>
        </section>

        <article
          class="bg-white dark:bg-[#151513] rounded-2xl border border-[#e7e4dc] dark:border-[#252420] shadow-[0_1px_2px_rgba(24,23,21,0.04)] px-6 py-8 sm:px-10 sm:py-10"
        >
          ${renderMarkdown(mcpGuideText, { stripLeadingH1: true })}
        </article>
      </div>
      ${siteFooter()}
    </main>
  `;
};
