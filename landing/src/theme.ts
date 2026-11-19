export const themeColorLight = "#faf9f5";
export const themeColorDark = "#141412";

export const themeColorForMode = (isDark: boolean) =>
  isDark ? themeColorDark : themeColorLight;

type MetaLike = {
  setAttribute: (name: string, value: string) => void;
  removeAttribute: (name: string) => void;
  remove: () => void;
};

export type ThemeDocument<TMeta extends MetaLike = MetaLike> = {
  documentElement: {
    classList: {
      toggle: (token: string, force?: boolean) => boolean;
    };
  };
  head: {
    appendChild: (node: TMeta) => unknown;
  } | null;
  querySelectorAll: (selector: string) => Iterable<TMeta>;
  createElement: (tagName: "meta") => TMeta;
};

const syncMeta = <TMeta extends MetaLike>(
  doc: ThemeDocument<TMeta>,
  name: string,
  content: string,
) => {
  const existing = Array.from(doc.querySelectorAll(`meta[name="${name}"]`));
  const primary = existing[0] ?? doc.createElement("meta");
  primary.setAttribute("name", name);
  primary.setAttribute("content", content);
  primary.removeAttribute("media");
  existing.slice(1).forEach((el) => el.remove());
  if (existing.length === 0) doc.head?.appendChild(primary);
};

export const applyDocumentTheme = <TMeta extends MetaLike>(
  doc: ThemeDocument<TMeta>,
  isDark: boolean,
) => {
  doc.documentElement.classList.toggle("dark", isDark);
  syncMeta(doc, "theme-color", themeColorForMode(isDark));
  syncMeta(doc, "color-scheme", isDark ? "dark" : "light");
};
