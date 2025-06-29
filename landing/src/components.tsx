import { useState } from "preact/hooks";
import type { JSX } from "preact/jsx-runtime";

type ButtonProps = JSX.IntrinsicElements["button"];

export const Button = (props: ButtonProps) => {
  const { className = "", children, disabled, ...rest } = props;
  const base = "px-4 py-2 font-medium rounded transition " +
    (disabled
      ? "bg-gray-300 dark:bg-gray-700 text-gray-400 cursor-not-allowed opacity-60 "
      : "bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white cursor-pointer ");
  return (
    <button
      {...rest}
      disabled={disabled}
      aria-disabled={disabled}
      className={`${base}${className ? " " + className : ""}`}
    >
      {children}
    </button>
  );
};

const truncateStr = (str: string) => {
  if (str.length <= 10) return str;
  return `${str.slice(0, 6)}...${str.slice(-4)}`;
};

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
