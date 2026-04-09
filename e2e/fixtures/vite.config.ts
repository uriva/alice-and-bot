import { defineConfig } from "vite";
import deno from "@deno/vite-plugin";

export default defineConfig({
  root: "./",
  server: { port: 3003, allowedHosts: true },
  plugins: [deno()],
  publicDir: "../../widget/dist",
});
