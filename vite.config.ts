import { defineConfig, type Plugin } from "vite";
import deno from "@deno/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type RouteMeta, routeMetaByPath } from "./landing/src/route-meta.ts";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const siteOrigin = "https://aliceandbot.com";

const escapeAttr = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");

const withRouteMeta = (html: string, routePath: string, meta: RouteMeta) => {
  const canonicalUrl = `${siteOrigin}${meta.canonicalPath ?? routePath}`;
  const titleAttr = escapeAttr(meta.title);
  const descAttr = escapeAttr(meta.description);
  return html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${titleAttr}</title>`)
    .replace(
      /(<meta\s+name="description"\s+content=")[\s\S]*?(")/,
      `$1${descAttr}$2`,
    )
    .replace(
      /(<link\s+rel="canonical"\s+href=")[\s\S]*?(")/,
      `$1${canonicalUrl}$2`,
    )
    .replace(
      /(<meta\s+property="og:url"\s+content=")[\s\S]*?(")/,
      `$1${canonicalUrl}$2`,
    )
    .replace(
      /(<meta\s+property="og:title"\s+content=")[\s\S]*?(")/,
      `$1${titleAttr}$2`,
    )
    .replace(
      /(<meta\s+property="og:description"\s+content=")[\s\S]*?(")/,
      `$1${descAttr}$2`,
    )
    .replace(
      /(<meta\s+name="twitter:title"\s+content=")[\s\S]*?(")/,
      `$1${titleAttr}$2`,
    )
    .replace(
      /(<meta\s+name="twitter:description"\s+content=")[\s\S]*?(")/,
      `$1${descAttr}$2`,
    );
};

const spaFallback = (): Plugin => ({
  name: "spa-fallback-404",
  closeBundle: () => {
    const distDir = resolve(__dirname, "landing/dist");
    const src = resolve(distDir, "index.html");
    const dest = resolve(distDir, "404.html");
    if (!existsSync(src)) {
      console.warn(
        "spaFallback: index.html not found, skipping copy to 404.html",
      );
      return;
    }
    copyFileSync(src, dest);
    const indexHtml = readFileSync(src, "utf8");
    Object.entries(routeMetaByPath)
      .filter(([routePath]) => routePath !== "/")
      .forEach(([routePath, meta]) => {
        const dir = resolve(distDir, routePath.slice(1));
        mkdirSync(dir, { recursive: true });
        writeFileSync(
          resolve(dir, "index.html"),
          withRouteMeta(indexHtml, routePath, meta),
        );
      });
  },
});

const buildServiceWorker = (): Plugin => ({
  name: "build-service-worker",
  buildStart: async () => {
    const cmd = new Deno.Command("deno", {
      args: [
        "bundle",
        "--platform",
        "browser",
        "--format",
        "iife",
        "--minify",
        resolve(__dirname, "landing/src/sw-entry.ts"),
        "--output",
        resolve(__dirname, "landing/public/sw.js"),
      ],
    });
    const out = await cmd.output();
    if (!out.success) {
      throw new Error(new TextDecoder().decode(out.stderr));
    }
  },
});

export default defineConfig({
  root: "./landing",
  server: { port: 3000, allowedHosts: true },
  plugins: [buildServiceWorker(), deno(), tailwindcss(), spaFallback()],
  build: { sourcemap: true, outDir: resolve(__dirname, "landing/dist") },
});
