import { JSX } from "preact";

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
