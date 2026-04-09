export type DarkModeOverride = "light" | "dark" | null;

let override: DarkModeOverride = null;
const listeners = new Set<(isDark: boolean) => void>();

const getPref = () => {
  if (override !== null) return override === "dark";
  return typeof globalThis !== "undefined" &&
    "matchMedia" in globalThis &&
    globalThis.matchMedia("(prefers-color-scheme: dark)").matches;
};

export const setDarkModeOverride = (mode: DarkModeOverride): void => {
  override = mode;
  listeners.forEach((l) => l(mode === "dark"));
};

export const subscribeDarkMode = (
  onChange: (isDark: boolean) => void,
): () => void => {
  onChange(getPref());

  const listener = (isDark: boolean) => onChange(isDark);
  listeners.add(listener);

  const mql = globalThis.matchMedia("(prefers-color-scheme: dark)");
  const mediaHandler = (e: MediaQueryListEvent) => {
    if (override === null) onChange(e.matches);
  };
  mql.addEventListener("change", mediaHandler);

  return () => {
    listeners.delete(listener);
    mql.removeEventListener("change", mediaHandler);
  };
};
