import { ShellCode } from "./components.tsx";
import { Header } from "./header.tsx";
import { useClearViewportStyles } from "./useClearViewportStyles.ts";

const stepCardClass =
  "w-full bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-lg p-8 mb-6";

const stepNumberClass =
  "inline-flex items-center justify-center w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-bold text-lg mr-3 shrink-0";

const installCommand =
  `curl -fsSL "https://raw.githubusercontent.com/uriva/alice-and-bot/main/opencode-plugin/install.sh?\$(date +%s)" | bash`;

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
    <>
      <Header />
      <main class="min-h-screen bg-[#f8f7f4] dark:bg-[#0a0a0a] py-12 px-4">
        <div class="max-w-3xl mx-auto">
          <div class="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div class="bg-gray-800 dark:bg-gray-950 px-6 py-4 border-b border-gray-700 dark:border-gray-800">
              <h1 class="text-2xl font-bold text-white text-center">
                OpenCode + Alice&Bot
              </h1>
            </div>

            <div class="px-6 py-8">
              <p class="text-lg text-gray-700 dark:text-gray-300 text-center mb-10">
                Chat with your OpenCode session from your phone. End-to-end
                encrypted.
              </p>

              <Step number={1} title="Install the Plugin">
                <p class="text-gray-700 dark:text-gray-300 mb-3">
                  Paste this one-liner in your terminal to install the Alice&Bot
                  OpenCode plugin:
                </p>
                <ShellCode code={installCommand} />
                <p class="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  This will download the plugin and register it automatically in
                  your OpenCode configuration. Zero dependencies required!
                </p>
              </Step>

              <Step number={2} title="Restart OpenCode">
                <p class="text-gray-700 dark:text-gray-300 mb-3">
                  If you already have an OpenCode session running, close it and
                  start a new one to load the new plugin.
                </p>
              </Step>

              <Step number={3} title="Start chatting">
                <p class="text-gray-700 dark:text-gray-300 mb-3">
                  In OpenCode, type:
                </p>
                <ShellCode code="/aliceandbot" />
                <p class="text-gray-700 dark:text-gray-300 mt-4">
                  The plugin will display a QR code in your terminal. Scan it
                  with your phone to start chatting with your OpenCode session.
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
