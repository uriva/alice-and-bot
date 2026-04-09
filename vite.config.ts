import { defineConfig } from "vite";
import deno from "@deno/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: "./landing",
  server: { port: 3000, allowedHosts: true },
  plugins: [deno(), tailwindcss()],
  build: { sourcemap: true, outDir: resolve(__dirname, "landing/dist") },
});
