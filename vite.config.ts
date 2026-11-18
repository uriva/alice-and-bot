import { defineConfig, type Plugin } from "vite";
import deno from "@deno/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const spaFallback = (): Plugin => ({
  name: "spa-fallback-404",
  closeBundle: () => {
    const src = resolve(__dirname, "landing/dist/index.html");
    const dest = resolve(__dirname, "landing/dist/404.html");
    if (existsSync(src)) {
      copyFileSync(src, dest);
    } else {
      console.warn(
        "spaFallback: index.html not found, skipping copy to 404.html",
      );
    }
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
