import { html, type TemplateResult } from "lit";
import { renderMarkdown } from "./markdown.ts";
import { header } from "./header.ts";
import { useClearViewportStyles } from "./clear-viewport-styles.ts";
import mcpGuideText from "./mcp-guide.md?raw";

export const mcpGuide = (): TemplateResult => {
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
            <h1 class="text-2xl font-bold text-white text-center">MCP Guide</h1>
          </div>
          <div class="px-6 py-8">
            ${renderMarkdown(mcpGuideText)}
          </div>
        </div>
      </div>
    </main>
  `;
};
