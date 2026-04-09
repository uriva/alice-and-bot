export const subscribeIsMobile = (
  onChange: (isMobile: boolean) => void,
): () => void => {
  const check = () => globalThis.innerWidth <= 600;
  onChange(typeof globalThis !== "undefined" ? check() : false);
  const handler = () => onChange(check());
  globalThis.addEventListener("resize", handler);
  return () => globalThis.removeEventListener("resize", handler);
};
