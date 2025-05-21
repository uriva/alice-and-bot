import { JSX } from "preact";
import { useState } from "preact/hooks";

export const Button = (props: JSX.IntrinsicElements["button"]) => {
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

export const PublicKey = (
  { pubkey }: { pubkey: string },
) => {
  const [copied, setCopied] = useState(false);
  const truncateKey = (key: string) => {
    if (key.length <= 10) return key;
    return `${key.slice(0, 6)}...${key.slice(-4)}`;
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(pubkey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <span class="inline-flex items-center gap-2 font-mono text-sm">
      <span>{truncateKey(pubkey)}</span>
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
