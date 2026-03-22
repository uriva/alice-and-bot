import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import docsText from "./docs.md?raw";
import { homePath } from "./paths.ts";
import { useClearViewportStyles } from "./useClearViewportStyles.ts";

export const Docs = () => {
  useClearViewportStyles();
  return (
    <div class="min-h-screen bg-gradient-to-br from-gray-900 via-gray-950 to-blue-950">
    <div
      style={{
        maxWidth: 800,
        margin: "0 auto",
        padding: "24px",
      }}
    >
      <a
        href={homePath}
        class="inline-block mb-6 text-blue-400 hover:text-blue-300 transition font-medium"
      >
        &larr; Back to Alice&Bot
      </a>
      <div style={{ color: "white" }}>
        <Markdown
          remarkPlugins={[remarkGfm]}
          components={{
            // @ts-expect-error Markdown types are not fully compatible with Preact
            h1: ({ children }) => (
              <h1 class="text-4xl font-extrabold mt-8 mb-4 text-blue-300 text-center">
                {children}
              </h1>
            ),
            // @ts-expect-error Markdown types are not fully compatible with Preact
            h2: ({ children }) => (
              <h2 class="text-2xl font-bold mt-10 mb-3 text-blue-200">
                {children}
              </h2>
            ),
            // @ts-expect-error Markdown types are not fully compatible with Preact
            h3: ({ children }) => (
              <h3 class="text-xl font-semibold mt-6 mb-2 text-blue-100">
                {children}
              </h3>
            ),
            // @ts-expect-error Markdown types are not fully compatible with Preact
            h4: ({ children }) => (
              <h4 class="text-lg font-semibold mt-4 mb-2 text-blue-100">
                {children}
              </h4>
            ),
            // @ts-expect-error Markdown types are not fully compatible with Preact
            p: ({ children }) => (
              <p class="mb-4 text-lg text-gray-300 leading-relaxed">
                {children}
              </p>
            ),
            // @ts-expect-error Markdown types are not fully compatible with Preact
            a: ({ children, href }) => (
              <a
                class="text-blue-400 underline hover:text-blue-300"
                target="_blank"
                rel="noopener noreferrer"
                href={href}
              >
                {children}
              </a>
            ),
            // @ts-expect-error Markdown types are not fully compatible with Preact
            img: ({ src, alt }) => (
              <img
                src={src}
                alt={alt}
                class="rounded-xl shadow-2xl my-6 w-full border border-gray-700"
              />
            ),
            // @ts-expect-error Markdown types are not fully compatible with Preact
            pre: ({ children }) => (
              <pre class="bg-gray-800 rounded-lg p-4 my-4 overflow-x-auto text-sm border border-gray-700">
                {children}
              </pre>
            ),
            // @ts-expect-error Markdown types are not fully compatible with Preact
            code: ({ children, className }) => {
              const isBlock = className?.startsWith("language-");
              if (isBlock) return <code class={className}>{children}</code>;
              return (
                <code class="bg-gray-800 text-blue-300 px-1.5 py-0.5 rounded text-sm">
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
              <thead class="border-b border-gray-600">{children}</thead>
            ),
            // @ts-expect-error Markdown types are not fully compatible with Preact
            th: ({ children }) => (
              <th class="py-2 px-3 text-blue-200 font-semibold text-sm">
                {children}
              </th>
            ),
            // @ts-expect-error Markdown types are not fully compatible with Preact
            td: ({ children }) => (
              <td class="py-2 px-3 text-gray-300 text-sm border-t border-gray-700">
                {children}
              </td>
            ),
            // @ts-expect-error Markdown types are not fully compatible with Preact
            ul: ({ children }) => (
              <ul class="list-disc list-inside my-4 pl-4 text-gray-300">
                {children}
              </ul>
            ),
            // @ts-expect-error Markdown types are not fully compatible with Preact
            ol: ({ children }) => (
              <ol class="list-decimal list-inside my-4 pl-4 text-gray-300">
                {children}
              </ol>
            ),
            // @ts-expect-error Markdown types are not fully compatible with Preact
            li: ({ children }) => <li class="mb-1">{children}</li>,
            // @ts-expect-error Markdown types are not fully compatible with Preact
            strong: ({ children }) => (
              <strong class="text-white font-semibold">{children}</strong>
            ),
          }}
        >
          {docsText}
        </Markdown>
      </div>
    </div>
  </div>
  );
};
