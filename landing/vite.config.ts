import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import deno from "@deno/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

const decodePath = resolve(
  __dirname,
  "../node_modules/.deno/decode-named-character-reference@1.2.0/node_modules/decode-named-character-reference/index.js",
);

export default defineConfig({
  root: resolve(__dirname),
  server: { port: 3000, allowedHosts: true },
  plugins: [
    preact({
      prerender: {
        enabled: true,
        renderTarget: "#root",
        additionalPrerenderRoutes: ["/guide", "/legal", "/manifesto"],
        prerenderScript: resolve(__dirname, "src/prerender.tsx"),
      },
    }),
    deno(),
    tailwindcss(),
  ],
  build: { sourcemap: true, outDir: resolve(__dirname, "dist") },
  resolve: {
    alias: { "decode-named-character-reference": decodePath },
  },
});
