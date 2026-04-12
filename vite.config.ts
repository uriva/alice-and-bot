import { defineConfig, type Plugin } from "vite";
import deno from "@deno/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const spaFallback = (): Plugin => ({
  name: "spa-fallback-404",
  closeBundle: () =>
    copyFileSync(
      resolve(__dirname, "landing/dist/index.html"),
      resolve(__dirname, "landing/dist/404.html"),
    ),
});

export default defineConfig({
  root: "./landing",
  server: { port: 3000, allowedHosts: true },
  plugins: [deno(), tailwindcss(), spaFallback()],
  build: { sourcemap: true, outDir: resolve(__dirname, "landing/dist") },
});
