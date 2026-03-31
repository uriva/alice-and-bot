import { Slot } from "@radix-ui/react-slot";
import hljs from "highlight.js/lib/core";
import typescript from "highlight.js/lib/languages/typescript";
import { useState } from "preact/hooks";
import type { JSX } from "preact/jsx-runtime";

hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("javascript", typescript);
hljs.registerLanguage("json", typescript);
hljs.registerLanguage("bash", typescript);
hljs.registerLanguage("shell", typescript);

type ButtonVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "ghost"
  | "link";
type ButtonSize = "default" | "sm" | "lg" | "icon";

type ButtonProps =
  & JSX.IntrinsicElements["button"]
  & { variant?: ButtonVariant; size?: ButtonSize; asChild?: boolean };

const variantClasses: Record<ButtonVariant, string> = {
  default:
    "bg-gray-800 hover:bg-gray-900 dark:bg-gray-300 dark:hover:bg-gray-400 text-white dark:text-gray-900",
  secondary:
    "bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200",
  destructive:
    "bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600 text-white",
  outline:
    "border border-gray-300 dark:border-gray-600 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200",
  ghost:
    "bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200",
  link:
    "bg-transparent underline-offset-4 hover:underline text-gray-800 dark:text-gray-200",
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "h-10 px-4 py-2",
  sm: "h-9 px-3 text-sm",
  lg: "h-11 px-8 text-lg",
  icon: "h-10 w-10",
};

const baseClass =
  "inline-flex items-center justify-center whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer";

export const Button = ({
  variant = "default",
  size = "default",
  asChild = false,
  className = "",
  ...rest
}: ButtonProps) => {
  const Comp = asChild ? Slot : "button";
  const classes = `${baseClass} ${variantClasses[variant]} ${
    sizeClasses[size]
  }${className ? " " + className : ""}`;
  // deno-lint-ignore no-explicit-any
  return <Comp className={classes} {...rest as any} />;
};

const truncateStr = (str: string) =>
  str.length <= 10 ? str : `${str.slice(0, 6)}...${str.slice(-4)}`;

export const CopyableString = ({ str }: { str: string }) => {
  const [copied, setCopied] = useState(false);
  const copyToClipboard = () => {
    navigator.clipboard.writeText(str).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <span class="inline-flex items-center gap-2 font-mono text-sm">
      <span>{truncateStr(str)}</span>
      <button
        type="button"
        onClick={copyToClipboard}
        class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        title="Copy public key"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </span>
  );
};

const highlight = (code: string, lang: string) =>
  hljs.highlight(code, { language: lang }).value;

const codeBlockBaseClass =
  "bg-gray-100 dark:bg-gray-800 rounded-lg p-4 my-4 overflow-x-auto text-sm border border-gray-200 dark:border-gray-700 font-mono text-gray-800 dark:text-gray-200";

const codeBlockHeaderClass =
  "flex items-center justify-between px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-t-lg border-b border-gray-300 dark:border-gray-600";

const codeBlockContainerClass =
  "rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden my-4";

export const InlineCode = (
  { children }: { children: preact.ComponentChildren },
) => (
  <code class="bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 px-1.5 py-0.5 rounded text-sm font-mono">
    {children}
  </code>
);

export const CodeBlock = ({
  code,
  lang = "typescript",
  filename,
  showLineNumbers = false,
}: {
  code: string;
  lang?: string;
  filename?: string;
  showLineNumbers?: boolean;
}) => {
  const [copied, setCopied] = useState(false);
  const _lines = code.split("\n");
  const _lineNumbers = showLineNumbers
    ? _lines.map((_, i) => (
      <span class="inline-block w-8 text-right text-gray-400 dark:text-gray-500 select-none mr-3">
        {i + 1}
      </span>
    ))
    : null;

  return (
    <div class={codeBlockContainerClass}>
      <div class={codeBlockHeaderClass}>
        <span class="text-xs text-gray-600 dark:text-gray-400 font-mono">
          {filename || lang}
        </span>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(code).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          }}
          class="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre
        class={`${codeBlockBaseClass} my-0 rounded-t-none`}
        style={{ margin: 0 }}
      >
        <code
          class={`language-${lang}`}
          dangerouslySetInnerHTML={{
            __html: highlight(code, lang),
          }}
        />
      </pre>
    </div>
  );
};

export const ShellCode = ({ code }: { code: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div class={codeBlockContainerClass}>
      <div class={codeBlockHeaderClass}>
        <span class="text-xs text-gray-600 dark:text-gray-400 font-mono">
          shell
        </span>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(code).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          }}
          class="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre
        class={`${codeBlockBaseClass} my-0 rounded-t-none text-gray-700 dark:text-cyan-400`}
        style={{ margin: 0 }}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
};
