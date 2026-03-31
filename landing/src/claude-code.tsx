import hljs from "highlight.js/lib/core";
import typescript from "highlight.js/lib/languages/typescript";
import { Header } from "./header.tsx";
import { useClearViewportStyles } from "./useClearViewportStyles.ts";

hljs.registerLanguage("json", typescript);

const stepCardClass =
  "w-full bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-lg p-8 mb-6";

const stepNumberClass =
  "inline-flex items-center justify-center w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-bold text-lg mr-3 shrink-0";

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

const highlight = (code: string, lang: string) =>
  hljs.highlight(code, { language: lang }).value;

const HighlightedCode = (
  { code, lang }: { code: string; lang: string },
) => (
  <pre class="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 my-4 overflow-x-auto text-sm border border-gray-200 dark:border-gray-700 font-mono">
    <code
      class="language-typescript"
      dangerouslySetInnerHTML={{ __html: highlight(code, lang) }}
    />
  </pre>
);

const ShellCode = ({ code }: { code: string }) => (
  <pre class="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-cyan-400 rounded-lg p-4 my-4 overflow-x-auto text-sm border border-gray-200 dark:border-gray-700 font-mono cursor-pointer">
    <code>{code}</code>
  </pre>
);

const Step = ({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: preact.ComponentChildren;
}) => (
  <div class={stepCardClass}>
    <div class="flex items-center mb-4">
      <span class={stepNumberClass}>{number}</span>
      <h2 class="text-xl font-bold text-gray-800 dark:text-gray-200">
        {title}
      </h2>
    </div>
    {children}
  </div>
);

export const ClaudeCode = () => {
  useClearViewportStyles();
  return (
    <>
      <Header />
      <main class="min-h-screen bg-[#f8f7f4] dark:bg-[#0a0a0a] py-12 px-4">
        <div class="max-w-3xl mx-auto">
          <div class="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div class="bg-gray-800 dark:bg-gray-950 px-6 py-4 border-b border-gray-700 dark:border-gray-800">
              <h1 class="text-2xl font-bold text-white text-center">
                Claude Code + Alice&Bot
              </h1>
            </div>

            <div class="px-6 py-8">
              <p class="text-lg text-gray-700 dark:text-gray-300 text-center mb-10">
                Chat with your coding session from your phone. End-to-end
                encrypted.
              </p>

              <Step number={1} title="Install the MCP server">
                <p class="text-gray-700 dark:text-gray-300 mb-3">
                  Paste this in your terminal:
                </p>
                <ShellCode code={installCommand} />
                <p class="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  Downloads a single binary to{" "}
                  <code class="bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 px-1.5 py-0.5 rounded text-sm">
                    ~/.local/bin/alice-and-bot-mcp
                  </code>. The binary is ~100MB because Deno embeds its entire
                  runtime — even a hello world is ~90MB.
                </p>
              </Step>

              <Step number={2} title="Add to Claude Code">
                <p class="text-gray-700 dark:text-gray-300 mb-3">
                  Add this to your{" "}
                  <code class="bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 px-1.5 py-0.5 rounded text-sm">
                    .claude/settings.json
                  </code>:
                </p>
                <HighlightedCode code={mcpConfig} lang="json" />
                <p class="text-sm text-gray-600 dark:text-gray-400 mt-3">
                  Or just ask Claude to add it for you.
                </p>
              </Step>

              <Step number={3} title="Start chatting">
                <p class="text-gray-700 dark:text-gray-300 mb-3">
                  In Claude Code, type:
                </p>
                <ShellCode code="Set up Alice&Bot so I can message this session from my phone" />
                <p class="text-gray-700 dark:text-gray-300 mt-4">
                  Claude will show a QR code. Scan it with your phone. That's it
                  — you're chatting with your coding session.
                </p>
              </Step>

              <div class="text-center mt-10 mb-8">
                <p class="text-gray-500 dark:text-gray-400 text-sm">
                  Messages are end-to-end encrypted. The relay never sees
                  plaintext.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
};
