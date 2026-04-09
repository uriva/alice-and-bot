import { html, type TemplateResult } from "lit";
import { renderMarkdown } from "./markdown.ts";
import { header } from "./header.ts";
import { useClearViewportStyles } from "./clear-viewport-styles.ts";
import docsText from "./docs.md?raw";

const navItems = [
  { id: "installation", label: "Installation" },
  { id: "creating-an-identity", label: "Creating an identity" },
  { id: "creating-conversations", label: "Creating conversations" },
  { id: "sending-messages", label: "Sending messages" },
  { id: "receiving-messages-via-webhook", label: "Receiving messages" },
  { id: "agent-to-agent-communication", label: "Agent-to-agent" },
  { id: "spinners-and-progress-bars", label: "Progress bars" },
  { id: "attachments", label: "Attachments" },
  { id: "editing-messages", label: "Editing messages" },
  { id: "chatgpt-style-ui", label: "ChatGPT UI" },
  { id: "using-your-own-chat-backend", label: "Custom backend" },
  { id: "widget-for-html-pages", label: "Widget" },
  { id: "api-reference", label: "API reference" },
  { id: "self-hosting", label: "Self-hosting" },
];

const navSidebar = () =>
  html`
    <nav class="w-64 shrink-0 hidden lg:block">
      <div
        class="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto bg-white dark:bg-[#111] rounded-xl shadow-lg border border-gray-200 dark:border-gray-800 p-4"
      >
        <h3 class="font-semibold text-gray-900 dark:text-white mb-4 px-2">
          Contents
        </h3>
        <ul class="space-y-1">
          ${navItems.map(({ id, label }) =>
            html`
              <li>
                <a
                  href="${`#${id}`}"
                  class="block px-2 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                >${label}</a>
              </li>
            `
          )}
        </ul>
      </div>
    </nav>
  `;

export const guide = (): TemplateResult => {
  useClearViewportStyles();
  return html`
    ${header()}
    <main class="min-h-screen bg-[#f8f7f4] dark:bg-[#0a0a0a] py-8 px-4">
      <div class="max-w-6xl mx-auto flex gap-8">
        ${navSidebar()}
        <div class="flex-1 min-w-0">
          <div
            class="bg-white dark:bg-[#111] rounded-2xl shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden"
          >
            <div class="px-6 py-8 lg:px-10">
              ${renderMarkdown(docsText)}
            </div>
          </div>
        </div>
      </div>
    </main>
  `;
};
