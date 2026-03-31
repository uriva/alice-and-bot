import { homePath } from "./paths.ts";
import { useClearViewportStyles } from "./useClearViewportStyles.ts";

const stepCardClass =
  "w-full bg-white/90 dark:bg-gray-900/80 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xl p-8 mb-6";

const stepNumberClass =
  "inline-flex items-center justify-center w-10 h-10 rounded-full bg-gray-700 text-white font-bold text-lg mr-3 shrink-0";

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

const installCommand =
  `curl -fsSL "https://raw.githubusercontent.com/uriva/alice-and-bot/main/opencode-plugin/install.sh?\$(date +%s)" | bash`;

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
      <h2 class="text-xl font-bold text-gray-800 dark:text-gray-200">
        {title}
      </h2>
    </div>
    {children}
  </div>
);

export const OpenCodePage = () => {
  useClearViewportStyles();
  return (
    <div class="min-h-screen bg-gradient-to-br from-gray-900 via-gray-950 to-gray-950">
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "24px" }}>
        <a
          href={homePath}
          class="inline-block mb-6 text-gray-400 hover:text-gray-300 transition font-medium"
        >
          &larr; Back to Alice&Bot
        </a>

        <h1 class="text-4xl font-extrabold text-gray-100 text-center mb-2">
          OpenCode + Alice&Bot
        </h1>
        <p class="text-lg text-gray-300 text-center mb-10">
          Chat with your OpenCode session from your phone. End-to-end encrypted.
        </p>

        <Step number={1} title="Install the Plugin">
          <p class="text-gray-300 mb-3">
            Paste this one-liner in your terminal to install the Alice&Bot
            OpenCode plugin:
          </p>
          <ShellCode code={installCommand} />
          <p class="text-sm text-gray-400 mt-2">
            This will download the plugin and register it automatically in your
            OpenCode configuration. Zero dependencies required!
          </p>
        </Step>

        <Step number={2} title="Restart OpenCode">
          <p class="text-gray-300 mb-3">
            If you already have an OpenCode session running, close it and start
            a new one to load the new plugin.
          </p>
        </Step>

        <Step number={3} title="Start chatting">
          <p class="text-gray-300 mb-3">
            In OpenCode, type:
          </p>
          <ShellCode code="/aliceandbot" />
          <p class="text-gray-300 mt-4">
            The plugin will display a QR code in your terminal. Scan it with
            your phone to start chatting with your OpenCode session.
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
