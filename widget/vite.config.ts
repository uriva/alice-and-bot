import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import deno from "@deno/vite-plugin";

export default defineConfig({
  root: "./",
  server: { port: 3000 },
  plugins: [preact(), deno()],
  build: {
    sourcemap: true,
    outDir: "../landing/public/widget",
    lib: {
      entry: "src/entry.tsx",
      name: "aliceAndBot",
      fileName: "widget",
      formats: ["iife"],
    },
  },
});
