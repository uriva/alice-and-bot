import { toast } from "react-hot-toast";
import Markdown from "react-markdown";
import { baseUrl } from "../../protocol/src/clientApi.ts";
import { Button } from "./components.tsx";
import { Header } from "./header.tsx";
import manifestoText from "./manifesto.md?raw";
import { useClearViewportStyles } from "./useClearViewportStyles.ts";

export const Manifesto = () => {
  useClearViewportStyles();
  const manifestoUrl = baseUrl + "/";

  const shareText = encodeURIComponent(
    "Check out the Alice&Bot Manifesto! It's time to unbreak chat for the AI era.",
  );
  const shareUrl = encodeURIComponent(manifestoUrl);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(manifestoUrl);
      toast.success("Link copied to clipboard!");
    } catch (_e) {
      toast.error("Failed to copy link");
    }
  };

  return (
    <>
      <Header />
      <main class="min-h-screen bg-[#f8f7f4] dark:bg-[#0a0a0a] py-12 px-4">
        <div class="max-w-3xl mx-auto">
          <div class="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div class="bg-gray-800 dark:bg-gray-950 px-6 py-4 border-b border-gray-700 dark:border-gray-800">
              <h1 class="text-2xl font-bold text-white text-center">
                The Alice&Bot Manifesto
              </h1>
            </div>

            <div class="px-6 py-8">
              <div class="flex flex-wrap gap-3 justify-center mb-8">
                <a
                  href={`https://twitter.com/intent/tweet?url=${shareUrl}&text=${shareText}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 font-medium text-sm transition-colors"
                >
                  Share on Twitter/X
                </a>
                <a
                  href={`https://www.linkedin.com/shareArticle?mini=true&url=${shareUrl}&title=${shareText}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 font-medium text-sm transition-colors"
                >
                  Share on LinkedIn
                </a>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleCopy}
                >
                  Copy Link
                </Button>
              </div>

              <div class="prose dark:prose-invert max-w-none">
                <Markdown
                  components={{
                    // @ts-expect-error Markdown types are not fully compatible with Preact
                    h1: ({ children }) => (
                      <h1 className="text-3xl font-extrabold mt-8 mb-4 text-gray-900 dark:text-white">
                        {children}
                      </h1>
                    ),
                    // @ts-expect-error Markdown types are not fully compatible with Preact
                    h2: ({ children }) => (
                      <h2 className="text-2xl font-bold mt-6 mb-3 text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-gray-700 pb-2">
                        {children}
                      </h2>
                    ),
                    // @ts-expect-error Markdown types are not fully compatible with Preact
                    h3: ({ children }) => (
                      <h3 className="text-xl font-semibold mt-4 mb-2 text-gray-700 dark:text-gray-300">
                        {children}
                      </h3>
                    ),
                    // @ts-expect-error Markdown types are not fully compatible with Preact
                    a: ({ children, href }) => (
                      <a
                        className="text-blue-600 dark:text-blue-400 underline hover:text-blue-800 dark:hover:text-blue-300"
                        target="_blank"
                        rel="noopener noreferrer"
                        href={href}
                      >
                        {children}
                      </a>
                    ),
                    // @ts-expect-error Markdown types are not fully compatible with Preact
                    ul: ({ children }) => (
                      <ul className="list-disc list-inside my-4 pl-4 space-y-2">
                        {children}
                      </ul>
                    ),
                    // @ts-expect-error Markdown types are not fully compatible with Preact
                    ol: ({ children }) => (
                      <ol className="list-decimal list-inside my-4 pl-4 space-y-2">
                        {children}
                      </ol>
                    ),
                    // @ts-expect-error Markdown types are not fully compatible with Preact
                    li: ({ children }) => (
                      <li className="text-gray-700 dark:text-gray-300">
                        {children}
                      </li>
                    ),
                    // @ts-expect-error Markdown types are not fully compatible with Preact
                    p: ({ children }) => (
                      <p className="mb-4 text-gray-700 dark:text-gray-300 leading-relaxed">
                        {children}
                      </p>
                    ),
                    // @ts-expect-error Markdown types are not fully compatible with Preact
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-4 border-gray-300 dark:border-gray-600 pl-4 italic my-4 text-gray-600 dark:text-gray-400">
                        {children}
                      </blockquote>
                    ),
                    // @ts-expect-error Markdown types are not fully compatible with Preact
                    hr: () => (
                      <hr className="my-8 border-gray-200 dark:border-gray-700" />
                    ),
                  }}
                >
                  {manifestoText}
                </Markdown>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
};
