import { map } from "@uri/gamla";
import { html, type TemplateResult } from "lit";
import { renderMarkdown } from "./markdown.ts";
import { header } from "./header.ts";
import { siteFooter } from "./footer.ts";
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

const renderNavItem = ({ id, label }: { id: string; label: string }) =>
  html`
    <li>
      <a
        href="${`#${id}`}"
        class="block px-2.5 py-1.5 text-sm text-[#66625b] dark:text-[#9c968c] hover:text-[#181715] dark:hover:text-[#f3f1ea] hover:bg-[#f2efe8] dark:hover:bg-[#1e1d19] rounded-lg transition-colors"
      >${label}</a>
    </li>
  `;

const navSidebar = () =>
  html`
    <nav class="w-60 shrink-0 hidden lg:block">
      <div
        class="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto bg-white dark:bg-[#151513] rounded-2xl border border-[#e7e4dc] dark:border-[#252420] shadow-[0_1px_2px_rgba(24,23,21,0.04)] p-4"
      >
        <p
          class="text-[11px] font-mono uppercase tracking-wider text-[#8c867c] mb-3 px-2.5"
        >
          Contents
        </p>
        <ul class="space-y-0.5">
          ${map(renderNavItem)(navItems)}
        </ul>
      </div>
    </nav>
  `;

export const guide = (): TemplateResult => {
  useClearViewportStyles();
  return html`
    ${header()}
    <main
      class="surface-dots min-h-screen text-[#181715] dark:text-[#f3f1ea] pt-10 sm:pt-14 flex flex-col"
    >
      <div class="max-w-6xl mx-auto w-full px-4 sm:px-6 flex-1 flex flex-col gap-8">
        <section class="max-w-3xl">
          <p
            class="text-xs font-mono uppercase tracking-wider text-[#66625b] dark:text-[#9c968c] mb-3"
          >
            Documentation
          </p>
          <h1
            class="text-3xl sm:text-5xl font-extrabold tracking-[-0.035em] leading-[1.08] mb-3"
          >
            SDK, webhooks, and widgets
          </h1>
          <p class="text-base sm:text-lg text-[#57534e] dark:text-[#a8a298] leading-relaxed">
            Everything you need to create keypair identities, wire encrypted
            agent rooms, or embed Alice&Bot on your site.
          </p>
        </section>

        <div class="flex gap-8 items-start">
          ${navSidebar()}
          <article
            class="flex-1 min-w-0 bg-white dark:bg-[#151513] rounded-2xl border border-[#e7e4dc] dark:border-[#252420] shadow-[0_1px_2px_rgba(24,23,21,0.04)] overflow-hidden"
          >
            <div class="px-6 py-8 sm:px-10 sm:py-10">
              ${renderMarkdown(docsText, { stripLeadingH1: true })}
            </div>
          </article>
        </div>
      </div>
      ${siteFooter()}
    </main>
  `;
};
