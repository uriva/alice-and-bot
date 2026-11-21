export const subscribeIsMobile = (
  onChange: (isMobile: boolean) => void,
): () => void => {
  const check = () => globalThis.innerWidth <= 600;
  onChange(typeof globalThis !== "undefined" ? check() : false);
  const handler = () => onChange(check());
  globalThis.addEventListener("resize", handler);
  return () => globalThis.removeEventListener("resize", handler);
};

export const isTouchOnlyDevice = (): boolean =>
  typeof globalThis.matchMedia === "function" &&
  (globalThis.matchMedia("(pointer: coarse)").matches ||
    globalThis.matchMedia("(hover: none)").matches);

export const blurActiveInput = (): void => {
  const el = globalThis.document?.activeElement;
  if (
    el instanceof HTMLElement &&
    (el.tagName === "INPUT" || el.tagName === "TEXTAREA")
  ) {
    el.blur();
  }
};
