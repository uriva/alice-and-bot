import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import deno from "@deno/vite-plugin";

export default defineConfig({
  root: "./",
  server: { port: 3000, allowedHosts: true },
  plugins: [preact(), deno()],
  resolve: {
    alias: {
      "@uri/gamla": "../../node_modules/@jsr/uri__gamla/src/index.ts",
      "typed-api": "../../node_modules/@jsr/uri__typed-api/src/main.ts",
    },
  },
});
