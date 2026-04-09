import { defineConfig } from "vite";
import deno from "@deno/vite-plugin";

export default defineConfig({
  root: "./",
  server: { port: 3000, allowedHosts: true },
  plugins: [deno()],
  build: {
    sourcemap: true,
    outDir: "dist",
    lib: {
      entry: "src/entry.ts",
      name: "aliceAndBot",
      fileName: "widget",
      formats: ["iife"],
    },
  },
});
