import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import deno from "@deno/vite-plugin";

export default defineConfig({
  root: "./",
  server: { port: 3003, allowedHosts: true },
  plugins: [preact(), deno()],
  publicDir: "../../widget/dist",
  resolve: {
    dedupe: ["preact", "preact/hooks", "preact/compat", "@preact/signals"],
  },
});
