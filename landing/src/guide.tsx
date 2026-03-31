import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import docsText from "./docs.md?raw";
import { InlineCode } from "./components.tsx";
import { Header } from "./header.tsx";
import { useClearViewportStyles } from "./useClearViewportStyles.ts";

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

const NavSidebar = () => (
  <nav class="w-64 shrink-0 hidden lg:block">
    <div class="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-200 dark:border-gray-800 p-4">
      <h3 class="font-semibold text-gray-900 dark:text-white mb-4 px-2">
        Contents
      </h3>
      <ul class="space-y-1">
        {navItems.map((item) => (
          <li>
            <a
              href={`#${item.id}`}
              class="block px-2 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  </nav>
);

export const Docs = () => {
  useClearViewportStyles();
  return (
    <>
      <Header />
      <main class="min-h-screen bg-[#f8f7f4] dark:bg-[#0a0a0a] py-8 px-4">
        <div class="max-w-6xl mx-auto flex gap-8">
          <NavSidebar />
          <div class="flex-1 min-w-0">
            <div class="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
              <div class="px-6 py-8 lg:px-10">
                <div class="prose dark:prose-invert max-w-none">
                  <Markdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeHighlight]}
                    components={{
                      // @ts-expect-error Markdown types are not fully compatible with Preact
                      h1: ({ children }) => (
                        <h1 class="text-3xl font-extrabold mt-4 mb-6 text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-4">
                          {children}
                        </h1>
                      ),
                      // @ts-expect-error Markdown types are not fully compatible with Preact
                      h2: ({ children }) => (
                        <h2
                          id={typeof children === "string"
                            ? children.toLowerCase().replace(/\s+/g, "-")
                            : ""}
                          class="text-2xl font-bold mt-10 mb-4 text-gray-800 dark:text-gray-200 scroll-mt-24"
                        >
                          {children}
                        </h2>
                      ),
                      // @ts-expect-error Markdown types are not fully compatible with Preact
                      h3: ({ children }) => (
                        <h3 class="text-xl font-semibold mt-6 mb-3 text-gray-700 dark:text-gray-300">
                          {children}
                        </h3>
                      ),
                      // @ts-expect-error Markdown types are not fully compatible with Preact
                      h4: ({ children }) => (
                        <h4 class="text-lg font-semibold mt-4 mb-2 text-gray-700 dark:text-gray-300">
                          {children}
                        </h4>
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
                      img: ({ src, alt }) => (
                        <img
                          src={src}
                          alt={alt}
                          class="rounded-xl shadow-lg my-6 w-full border border-gray-200 dark:border-gray-700"
                        />
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
                        if (isBlock) {
                          return <code class={className}>{children}</code>;
                        }
                        return <InlineCode>{children}</InlineCode>;
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
                    {docsText}
                  </Markdown>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
};
