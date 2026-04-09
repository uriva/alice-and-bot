const isElement = (el: HTMLElement | null): el is HTMLElement => el !== null;

const clearStyles = (el: HTMLElement) => {
  el.style.height = "";
  el.style.maxHeight = "";
  el.style.minHeight = "";
  el.style.overflow = "";
  el.style.removeProperty("--app-height");
};

export const useClearViewportStyles = () => {
  if (typeof document === "undefined") return;
  [document.documentElement, document.body, document.getElementById("root")]
    .filter(isElement)
    .forEach(clearStyles);
};
