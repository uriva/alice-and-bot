import { html, type TemplateResult } from "lit";
import { codeBlock, inlineCode, shellCode } from "./components.ts";
import { header } from "./header.ts";
import { useClearViewportStyles } from "./clear-viewport-styles.ts";

const stepCardClass =
  "w-full bg-white dark:bg-[#111] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-lg p-8 mb-6";

const stepNumberClass =
  "inline-flex items-center justify-center w-10 h-10 rounded-full bg-gray-200 dark:bg-[#2a2a2a] text-gray-800 dark:text-gray-200 font-bold text-lg mr-3 shrink-0";

const installCommand =
  "curl -fsSL https://storage.googleapis.com/alice-and-bot/cli/install.sh | sh";

const mcpConfig = JSON.stringify(
  {
    mcpServers: {
      aliceandbot: {
        command: "alice-and-bot-mcp",
      },
    },
  },
  null,
  2,
);

const step = (number: number, title: string, content: TemplateResult) =>
  html`
    <div class="${stepCardClass}">
      <div class="flex items-center mb-4">
        <span class="${stepNumberClass}">${number}</span>
        <h2 class="text-xl font-bold text-gray-800 dark:text-gray-200">
          ${title}
        </h2>
      </div>
      ${content}
    </div>
  `;

export const claudeCode = (): TemplateResult => {
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
              Claude Code + Alice&Bot
            </h1>
          </div>
          <div class="px-6 py-8">
            <p class="text-lg text-gray-700 dark:text-gray-300 text-center mb-10">
              Chat with your coding session from your phone. End-to-end encrypted.
            </p>

            ${step(
              1,
              "Install the MCP server",
              html`
                <p class="text-gray-700 dark:text-gray-300 mb-3">
                  Paste this in your terminal:
                </p>
                ${shellCode(installCommand)}
                <p class="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  Downloads a single binary to ${inlineCode(
                    "~/.local/bin/alice-and-bot-mcp",
                  )}. The binary is ~100MB because Deno
                  embeds its entire runtime — even a hello world is ~90MB.
                </p>
              `,
            )} ${step(
              2,
              "Add to Claude Code",
              html`
                <p class="text-gray-700 dark:text-gray-300 mb-3">
                  Add this to your ${inlineCode(".claude/settings.json")}:
                </p>
                ${codeBlock({
                  code: mcpConfig,
                  lang: "json",
                  filename: ".claude/settings.json",
                })}
                <p class="text-sm text-gray-600 dark:text-gray-400 mt-3">
                  Or just ask Claude to add it for you.
                </p>
              `,
            )} ${step(
              3,
              "Start chatting",
              html`
                <p class="text-gray-700 dark:text-gray-300 mb-3">In Claude Code, type:</p>
                ${shellCode(
                  "Set up Alice&Bot so I can message this session from my phone",
                )}
                <p class="text-gray-700 dark:text-gray-300 mt-4">
                  Claude will show a QR code. Scan it with your phone. That's it — you're
                  chatting with your coding session.
                </p>
              `,
            )}

            <div class="text-center mt-10 mb-8">
              <p class="text-gray-500 dark:text-gray-400 text-sm">
                Messages are end-to-end encrypted. The relay never sees plaintext.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  `;
};
