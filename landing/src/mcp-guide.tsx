import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import mcpGuideText from "./mcp-guide.md?raw";
import { Header } from "./header.tsx";
import { useClearViewportStyles } from "./useClearViewportStyles.ts";

export const McpGuide = () => {
  useClearViewportStyles();
  return (
    <>
      <Header />
      <main class="min-h-screen bg-[#f8f7f4] dark:bg-[#0a0a0a] py-12 px-4">
        <div class="max-w-3xl mx-auto">
          <div class="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div class="bg-gray-800 dark:bg-gray-950 px-6 py-4 border-b border-gray-700 dark:border-gray-800">
              <h1 class="text-2xl font-bold text-white text-center">
                MCP Guide
              </h1>
            </div>

            <div class="px-6 py-8">
              <div class="prose dark:prose-invert max-w-none">
                <Markdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                  components={{
                    // @ts-expect-error Markdown types are not fully compatible with Preact
                    h1: ({ children }) => (
                      <h1 class="text-3xl font-extrabold mt-8 mb-4 text-gray-900 dark:text-white">
                        {children}
                      </h1>
                    ),
                    // @ts-expect-error Markdown types are not fully compatible with Preact
                    h2: ({ children }) => (
                      <h2 class="text-2xl font-bold mt-6 mb-3 text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-gray-700 pb-2">
                        {children}
                      </h2>
                    ),
                    // @ts-expect-error Markdown types are not fully compatible with Preact
                    h3: ({ children }) => (
                      <h3 class="text-xl font-semibold mt-4 mb-2 text-gray-700 dark:text-gray-300">
                        {children}
                      </h3>
                    ),
                    // @ts-expect-error Markdown types are not fully compatible with Preact
                    p: ({ children }) => (
                      <p class="mb-4 text-gray-700 dark:text-gray-300 leading-relaxed">
                        {children}
                      </p>
                    ),
                    // @ts-expect-error Markdown types are not fully compatible with Preact
                    a: ({ children, href }) => (
                      <a
                        class="text-blue-600 dark:text-blue-400 underline hover:text-blue-800 dark:hover:text-blue-300"
                        target="_blank"
                        rel="noopener noreferrer"
                        href={href}
                      >
                        {children}
                      </a>
                    ),
                    // @ts-expect-error Markdown types are not fully compatible with Preact
                    pre: ({ children }) => (
                      <pre class="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 my-4 overflow-x-auto text-sm border border-gray-200 dark:border-gray-700">
                      {children}
                      </pre>
                    ),
                    // @ts-expect-error Markdown types are not fully compatible with Preact
                    code: ({ children, className }) => {
                      const isBlock = className?.includes("language-") ||
                        className?.includes("hljs");
                      if (isBlock) {return (
                          <code class={className}>{children}</code>
                        );}
                      return (
                        <code class="bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 px-1.5 py-0.5 rounded text-sm">
                          {children}
                        </code>
                      );
                    },
                    // @ts-expect-error Markdown types are not fully compatible with Preact
                    table: ({ children }) => (
                      <div class="overflow-x-auto my-4">
                        <table class="w-full text-left border-collapse">
                          {children}
                        </table>
                      </div>
                    ),
                    // @ts-expect-error Markdown types are not fully compatible with Preact
                    thead: ({ children }) => (
                      <thead class="border-b border-gray-300 dark:border-gray-600">
                        {children}
                      </thead>
                    ),
                    // @ts-expect-error Markdown types are not fully compatible with Preact
                    th: ({ children }) => (
                      <th class="py-2 px-3 text-gray-800 dark:text-gray-200 font-semibold text-sm">
                        {children}
                      </th>
                    ),
                    // @ts-expect-error Markdown types are not fully compatible with Preact
                    td: ({ children }) => (
                      <td class="py-2 px-3 text-gray-700 dark:text-gray-300 text-sm border-t border-gray-200 dark:border-gray-700">
                        {children}
                      </td>
                    ),
                    // @ts-expect-error Markdown types are not fully compatible with Preact
                    ul: ({ children }) => (
                      <ul class="list-disc list-inside my-4 pl-4 space-y-2">
                        {children}
                      </ul>
                    ),
                    // @ts-expect-error Markdown types are not fully compatible with Preact
                    ol: ({ children }) => (
                      <ol class="list-decimal list-inside my-4 pl-4 space-y-2">
                        {children}
                      </ol>
                    ),
                    // @ts-expect-error Markdown types are not fully compatible with Preact
                    li: ({ children }) => (
                      <li class="text-gray-700 dark:text-gray-300">
                        {children}
                      </li>
                    ),
                    // @ts-expect-error Markdown types are not fully compatible with Preact
                    strong: ({ children }) => (
                      <strong class="text-gray-900 dark:text-white font-semibold">
                        {children}
                      </strong>
                    ),
                  }}
                >
                  {mcpGuideText}
                </Markdown>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
};
