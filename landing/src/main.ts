import { html } from "lit";
import { setDarkModeOverride } from "../../lit/core/dark-mode.ts";
import { initRouter } from "./router.ts";
import { chat } from "./chat.ts";
import { guide } from "./guide.ts";
import { landing } from "./landing.ts";
import { legal } from "./legal.ts";
import { manifesto } from "./manifesto.ts";
import { mcpGuide } from "./mcp-guide.ts";
import { claudeCode } from "./claude-code.ts";
import { opencodePage } from "./opencode.ts";
import {
  chatPath,
  claudeCodePath,
  docsPath,
  guidePath,
  homePath,
  legalPath,
  manifestoPath,
  mcpGuidePath,
  opencodePath,
} from "./paths.ts";
import "./app.css";

const storedTheme = localStorage.getItem("theme");
if (storedTheme === "dark") {
  document.documentElement.classList.add("dark");
  setDarkModeOverride("dark");
} else if (storedTheme === "light") {
  setDarkModeOverride("light");
}

const notFound = () =>
  html`
    <div class="flex flex-col items-center justify-center w-full h-full">
      <h1 class="text-4xl font-bold text-gray-800 dark:text-gray-200">
        404 - Not Found
      </h1>
      <p class="text-lg text-gray-600 dark:text-gray-400">
        The page you are looking for does not exist.
      </p>
      <a
        href="${homePath}"
        class="mt-4 px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-900 dark:bg-gray-300 dark:text-gray-900 dark:hover:bg-gray-400"
      >Go to Home</a>
    </div>
  `;

initRouter({
  root: document.getElementById("root")!,
  routes: [
    { path: homePath, component: landing },
    { path: chatPath, component: chat },
    { path: docsPath, component: guide },
    { path: guidePath, component: guide },
    { path: legalPath, component: legal },
    { path: manifestoPath, component: manifesto },
    { path: mcpGuidePath, component: mcpGuide },
    { path: claudeCodePath, component: claudeCode },
    { path: opencodePath, component: opencodePage },
  ],
  notFound,
});
