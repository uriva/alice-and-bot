import hljs from "highlight.js/lib/core";
import typescript from "highlight.js/lib/languages/typescript";
import "highlight.js/styles/github-dark.css";
import { homePath } from "./paths.ts";
import { useClearViewportStyles } from "./useClearViewportStyles.ts";

hljs.registerLanguage("json", typescript);

const stepCardClass =
  "w-full bg-white/90 dark:bg-blue-950/80 rounded-2xl border border-blue-100 dark:border-blue-900 shadow-xl p-8 mb-6";

const stepNumberClass =
  "inline-flex items-center justify-center w-10 h-10 rounded-full bg-blue-600 text-white font-bold text-lg mr-3 shrink-0";

const codeBlockStyle = {
  borderRadius: "0.75rem",
  padding: "1rem",
  fontSize: "0.875rem",
  fontFamily: "monospace",
  whiteSpace: "pre-wrap" as const,
  wordBreak: "break-word" as const,
  background: "#0f172a",
  border: "1px solid #1e3a5f",
  overflow: "hidden",
};

const denoInstall = "curl -fsSL https://deno.land/install.sh | sh";

const downloadCommands = `mkdir -p ~/.local/share/aliceandbot-mcp
cd ~/.local/share/aliceandbot-mcp
curl -fsSLO https://raw.githubusercontent.com/uriva/alice-and-bot/main/mcp/mcp.ts
curl -fsSLO https://raw.githubusercontent.com/uriva/alice-and-bot/main/mcp/deno.json`;

const mcpConfig = (home: string) =>
  JSON.stringify(
    {
      mcpServers: {
        aliceandbot: {
          command: "deno",
          args: [
            "run",
            "-A",
            "--config",
            `${home}/.local/share/aliceandbot-mcp/deno.json`,
            `${home}/.local/share/aliceandbot-mcp/mcp.ts`,
          ],
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
  <pre style={codeBlockStyle}>
    <code
      style={{ background: "transparent", overflow: "hidden", padding: 0 }}
      class={`hljs language-${lang}`}
      dangerouslySetInnerHTML={{ __html: highlight(code, lang) }}
    />
  </pre>
);

const ShellCode = ({ code }: { code: string }) => (
  <pre style={{ ...codeBlockStyle, color: "#93c5fd", cursor: "pointer" }}>
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
      <h2 class="text-xl font-bold text-blue-700 dark:text-blue-300">
        {title}
      </h2>
    </div>
    {children}
  </div>
);

export const ClaudeCode = () => {
  useClearViewportStyles();
  return (
    <div class="min-h-screen bg-gradient-to-br from-gray-900 via-gray-950 to-blue-950">
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "24px" }}>
        <a
          href={homePath}
          class="inline-block mb-6 text-blue-400 hover:text-blue-300 transition font-medium"
        >
          &larr; Back to Alice&Bot
        </a>

        <h1 class="text-4xl font-extrabold text-blue-300 text-center mb-2">
          Claude Code + Alice&Bot
        </h1>
        <p class="text-lg text-gray-300 text-center mb-10">
          Chat with your coding session from your phone. End-to-end encrypted.
        </p>

        <Step number={1} title="Install Deno (if you don't have it)">
          <p class="text-gray-300 mb-3">
            Paste this in your terminal:
          </p>
          <ShellCode code={denoInstall} />
          <p class="text-sm text-gray-400 mt-2">
            Already have Deno? Skip this step.
          </p>
        </Step>

        <Step number={2} title="Download the MCP server">
          <p class="text-gray-300 mb-3">
            Paste this in your terminal:
          </p>
          <ShellCode code={downloadCommands} />
        </Step>

        <Step number={3} title="Add to Claude Code">
          <p class="text-gray-300 mb-3">
            Add this to your{" "}
            <code class="bg-gray-800 text-blue-300 px-1.5 py-0.5 rounded text-sm">
              .claude/settings.json
            </code>:
          </p>
          <div class="mb-4">
            <p class="text-sm text-gray-400 mb-2 font-semibold">macOS:</p>
            <HighlightedCode
              code={mcpConfig("/Users/YOUR_USERNAME")}
              lang="json"
            />
          </div>
          <div>
            <p class="text-sm text-gray-400 mb-2 font-semibold">Linux:</p>
            <HighlightedCode
              code={mcpConfig("/home/YOUR_USERNAME")}
              lang="json"
            />
          </div>
          <p class="text-sm text-gray-400 mt-3">
            Replace{" "}
            <code class="bg-gray-800 text-blue-300 px-1.5 py-0.5 rounded text-sm">
              YOUR_USERNAME
            </code>{" "}
            with your actual username, or just ask Claude to add it for you.
          </p>
        </Step>

        <Step number={4} title="Start chatting">
          <p class="text-gray-300 mb-3">
            In Claude Code, type:
          </p>
          <ShellCode code="Set up Alice&Bot so I can message this session from my phone" />
          <p class="text-gray-300 mt-4">
            Claude will show a QR code. Scan it with your phone. That's it —
            you're chatting with your coding session.
          </p>
        </Step>

        <div class="text-center mt-10 mb-8">
          <p class="text-gray-400 text-sm">
            Messages are end-to-end encrypted. The relay never sees plaintext.
          </p>
        </div>
      </div>
    </div>
  );
};
