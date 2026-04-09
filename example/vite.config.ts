import { defineConfig } from "vite";
import deno from "@deno/vite-plugin";

export default defineConfig({
  root: "./",
  server: { port: 3001, allowedHosts: true },
  plugins: [deno()],
});
