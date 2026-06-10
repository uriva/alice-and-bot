export type DarkModeOverride = "light" | "dark" | null;

let override: DarkModeOverride = null;
const listeners = new Set<(isDark: boolean) => void>();

const getPref = () => {
  if (override !== null) return override === "dark";
  if (
    typeof globalThis !== "undefined" && globalThis.document?.documentElement
  ) {
    const colorScheme = globalThis.document.documentElement.style.colorScheme;
    if (colorScheme === "dark") return true;
    if (colorScheme === "light") return false;
    if (globalThis.document.documentElement.classList.contains("dark")) {
      return true;
    }
    if (globalThis.document.documentElement.classList.contains("light")) {
      return false;
    }
  }
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

  let observer: MutationObserver | null = null;
  if (
    typeof globalThis !== "undefined" && "MutationObserver" in globalThis &&
    globalThis.document?.documentElement
  ) {
    observer = new MutationObserver(() => {
      if (override === null) {
        onChange(getPref());
      }
    });
    observer.observe(globalThis.document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
  }

  return () => {
    listeners.delete(listener);
    mql.removeEventListener("change", mediaHandler);
    observer?.disconnect();
  };
};
