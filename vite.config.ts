import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import deno from "@deno/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import { globSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const [decodePath] = globSync(
  resolve(
    __dirname,
    "node_modules/.deno/decode-named-character-reference@*/node_modules/decode-named-character-reference/index.js",
  ),
);

export default defineConfig({
  root: "./landing",
  server: { port: 3000, allowedHosts: true },
  plugins: [
    preact({
      prerender: {
        enabled: true,
        renderTarget: "#root",
        additionalPrerenderRoutes: [
          "/docs",
          "/guide",
          "/legal",
          "/manifesto",
          "/mcp",
          "/claude-code",
          "/opencode",
        ],
        prerenderScript: resolve(__dirname, "landing/src/prerender.tsx"),
      },
    }),
    deno(),
    tailwindcss(),
  ],
  build: { sourcemap: true, outDir: resolve(__dirname, "landing/dist") },
  resolve: {
    alias: { "decode-named-character-reference": decodePath },
  },
});
