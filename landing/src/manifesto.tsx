import { toast } from "react-hot-toast";
import Markdown from "react-markdown";
import { baseUrl } from "../../protocol/src/clientApi.ts";
import manifestoText from "./manifesto.md?raw";

export const Manifesto = () => {
  const manifestoUrl = baseUrl + "/";

  const shareText = encodeURIComponent(
    "Check out the Alice&Bot Manifesto! 👧🤖 It's time to unbreak chat for the AI era.",
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
    <div
      style={{
        maxWidth: 800,
        margin: "0 auto",
        padding: "24px",
        backgroundColor: "#1f2937",
        borderRadius: "8px",
      }}
    >
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div className="mb-2 text-white font-semibold text-lg">
          Share this Manifesto:
        </div>
        <div className="flex flex-wrap gap-3 justify-center">
          <a
            href={`https://twitter.com/intent/tweet?url=${shareUrl}&text=${shareText}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1 rounded bg-blue-500 hover:bg-blue-600 text-white font-medium"
            title="Share on Twitter/X"
          >
            Twitter/X
          </a>
          <a
            href={`https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1 rounded bg-blue-700 hover:bg-blue-800 text-white font-medium"
            title="Share on Facebook"
          >
            Facebook
          </a>
          <a
            href={`https://www.linkedin.com/shareArticle?mini=true&url=${shareUrl}&title=${shareText}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1 rounded bg-blue-800 hover:bg-blue-900 text-white font-medium"
            title="Share on LinkedIn"
          >
            LinkedIn
          </a>
          <button
            onClick={handleCopy}
            className="px-3 py-1 rounded bg-gray-600 hover:bg-gray-700 text-white font-medium"
            title="Copy link to clipboard"
            type="button"
          >
            Copy Link
          </button>
        </div>
      </div>
      <div style={{ color: "white" }}>
        <Markdown
          components={{
            // @ts-expect-error Markdown types are not fully compatible with Preact
            h1: ({ children }) => (
              <h1 className="text-4xl font-extrabold mt-8 mb-4 text-blue-700 dark:text-blue-300 text-center">
                {children}
              </h1>
            ),
            // @ts-expect-error Markdown types are not fully compatible with Preact
            h2: ({ children }) => (
              <h2 className="text-2xl font-bold mt-6 mb-3 text-blue-600 dark:text-blue-200">
                {children}
              </h2>
            ),
            // @ts-expect-error Markdown types are not fully compatible with Preact
            h3: ({ children }) => (
              <h3 className="text-xl font-semibold mt-4 mb-2 text-blue-500 dark:text-blue-100">
                {children}
              </h3>
            ),
            // @ts-expect-error Markdown types are not fully compatible with Preact
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
            // @ts-expect-error Markdown types are not fully compatible with Preact
            ul: ({ children }) => (
              <ul className="list-disc list-inside my-4 pl-6">{children}</ul>
            ),
            // @ts-expect-error Markdown types are not fully compatible with Preact
            ol: ({ children }) => (
              <ol className="list-decimal list-inside my-4 pl-6">{children}</ol>
            ),
            // @ts-expect-error Markdown types are not fully compatible with Preact
            li: ({ children }) => <li className="mb-1">{children}</li>,
            // @ts-expect-error Markdown types are not fully compatible with Preact
            p: ({ children }) => <p className="mb-4 text-lg">{children}</p>,
          }}
        >
          {manifestoText}
        </Markdown>
      </div>
    </div>
  );
};
