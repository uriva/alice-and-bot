import Markdown from "react-markdown";

import manifestoText from "./manifesto.md?raw";

export const Manifesto = () => (
  <div
    style={{
      maxWidth: 800,
      margin: "0 auto",
      padding: "24px",
      backgroundColor: "#1f2937",
      borderRadius: "8px",
    }}
  >
    <div style={{ color: "white" }}>
      <Markdown
        components={{
          h1: ({ children }) => (
            <h1 className="text-4xl font-extrabold mt-8 mb-4 text-blue-700 dark:text-blue-300 text-center">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-2xl font-bold mt-6 mb-3 text-blue-600 dark:text-blue-200">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-xl font-semibold mt-4 mb-2 text-blue-500 dark:text-blue-100">
              {children}
            </h3>
          ),
          a: ({ children, href }) => (
            <a
              className="text-blue-400 underline hover:text-blue-600"
              target="_blank"
              rel="noopener noreferrer"
              href={href}
            >
              {children}
            </a>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-inside my-4 pl-6">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside my-4 pl-6">{children}</ol>
          ),
          li: ({ children }) => <li className="mb-1">{children}</li>,
          p: ({ children }) => <p className="mb-4 text-lg">{children}</p>,
        }}
      >
        {manifestoText}
      </Markdown>
    </div>
  </div>
);
