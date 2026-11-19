import { assertEquals } from "@std/assert";
import {
  applyDocumentTheme,
  themeColorDark,
  themeColorLight,
  type ThemeDocument,
} from "./src/theme.ts";

type FakeMeta = {
  attrs: Map<string, string>;
  removed: boolean;
  setAttribute: (name: string, value: string) => void;
  removeAttribute: (name: string) => void;
  remove: () => void;
};

const createFakeMeta = (
  initial: Record<string, string>,
  list: FakeMeta[],
): FakeMeta => {
  const attrs = new Map(Object.entries(initial));
  const meta: FakeMeta = {
    attrs,
    removed: false,
    setAttribute: (name, value) => {
      attrs.set(name, value);
    },
    removeAttribute: (name) => {
      attrs.delete(name);
    },
    remove: () => {
      meta.removed = true;
      const idx = list.indexOf(meta);
      if (idx !== -1) list.splice(idx, 1);
    },
  };
  return meta;
};

const createFakeDoc = (initialMetas: Record<string, string>[]) => {
  const classes = new Set<string>();
  const metas: FakeMeta[] = [];
  initialMetas.forEach((init) => metas.push(createFakeMeta(init, metas)));

  const doc: ThemeDocument<FakeMeta> = {
    documentElement: {
      classList: {
        toggle: (token, force) => {
          const shouldAdd = force ?? !classes.has(token);
          if (shouldAdd) classes.add(token);
          else classes.delete(token);
          return shouldAdd;
        },
      },
    },
    head: {
      appendChild: (node) => {
        if (!metas.includes(node)) metas.push(node);
        return node;
      },
    },
    querySelectorAll: (selector) => {
      const match = selector.match(/^meta\[name="(.+)"\]$/);
      if (!match) return [];
      return metas.filter((m) => m.attrs.get("name") === match[1]);
    },
    createElement: () => createFakeMeta({}, metas),
  };

  return { doc, classes, metas };
};

Deno.test("applyDocumentTheme syncs dark class, theme-color, and color-scheme across toggles", () => {
  const { doc, classes, metas } = createFakeDoc([
    {
      name: "theme-color",
      content: themeColorLight,
      media: "(prefers-color-scheme: light)",
    },
    {
      name: "theme-color",
      content: themeColorDark,
      media: "(prefers-color-scheme: dark)",
    },
    { name: "color-scheme", content: "light dark" },
  ]);

  applyDocumentTheme(doc, true);

  assertEquals(classes.has("dark"), true);
  const darkThemeMetas = metas.filter((m) =>
    m.attrs.get("name") === "theme-color"
  );
  assertEquals(darkThemeMetas.length, 1);
  assertEquals(darkThemeMetas[0].attrs.get("content"), themeColorDark);
  assertEquals(darkThemeMetas[0].attrs.has("media"), false);
  const darkSchemeMetas = metas.filter((m) =>
    m.attrs.get("name") === "color-scheme"
  );
  assertEquals(darkSchemeMetas.length, 1);
  assertEquals(darkSchemeMetas[0].attrs.get("content"), "dark");

  applyDocumentTheme(doc, false);

  assertEquals(classes.has("dark"), false);
  assertEquals(darkThemeMetas[0].attrs.get("content"), themeColorLight);
  assertEquals(darkSchemeMetas[0].attrs.get("content"), "light");
});

Deno.test("applyDocumentTheme creates missing theme-color and color-scheme meta tags", () => {
  const { doc, metas } = createFakeDoc([]);

  applyDocumentTheme(doc, false);

  assertEquals(
    metas.find((m) => m.attrs.get("name") === "theme-color")?.attrs.get(
      "content",
    ),
    themeColorLight,
  );
  assertEquals(
    metas.find((m) => m.attrs.get("name") === "color-scheme")?.attrs.get(
      "content",
    ),
    "light",
  );
});
