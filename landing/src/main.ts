import { captureClientErrors } from "@uri/anomalisa";
import { html } from "lit";
import { setErrorReporter } from "../../lit/core/error-reporter.ts";
import {
  setDarkModeOverride,
  subscribeDarkMode,
} from "../../lit/core/dark-mode.ts";
import { applyDocumentTheme } from "./theme.ts";
import { installActiveConversationResponder } from "./activeConversationBridge.ts";
import { initRouter } from "./router.ts";
import { initPwaInstall } from "./pwaInstall.ts";
import {
  chatPath,
  comparePath,
  docsPath,
  guidePath,
  homePath,
  legalPath,
  manifestoPath,
  mcpGuidePath,
  privacyPath,
  termsPath,
} from "./paths.ts";
import { routeMetaByPath } from "./route-meta.ts";
import "./app.css";

const anomalisaReporter = captureClientErrors({
  token: "fd1a64b2-666e-4c0a-9fe6-b7954e6f86d3",
});

const analytics: { capture: (eventName: string) => void } = {
  capture: () => {},
};

const isChatRoute = (pathname: string) =>
  pathname === chatPath || pathname.startsWith(`${chatPath}/`);

const currentPathname = () => globalThis.location.pathname;

if (typeof window !== "undefined") {
  installActiveConversationResponder();
  initPwaInstall();
  if (!isChatRoute(currentPathname())) {
    setTimeout(() => {
      if (isChatRoute(currentPathname())) return;
      import("posthog-js")
        .then(({ posthog }) => {
          if (isChatRoute(currentPathname())) return;
          posthog.init("phc_C5kWoUuyR7D4qa5Cgw5aQGQx5zkhu92EUpTJ69ES5yJL", {
            api_host: "https://us.posthog.com",
            autocapture: false,
            disable_session_recording: true,
            persistence: "memory",
            before_send: (event) =>
              isChatRoute(currentPathname()) ? null : event,
          });
          analytics.capture = (eventName) => {
            if (!isChatRoute(currentPathname())) {
              posthog.capture(eventName);
            }
          };
        })
        .catch(() => {});
    }, 1500);
  }
}

setErrorReporter((eventName) => {
  anomalisaReporter(eventName);
  analytics.capture(eventName);
});

const setDocumentDarkClass = (isDark: boolean) => {
  applyDocumentTheme(document, isDark);
};

const storedTheme = localStorage.getItem("theme");
if (storedTheme === "dark") {
  setDarkModeOverride("dark");
} else if (storedTheme === "light") {
  setDarkModeOverride("light");
}

subscribeDarkMode(setDocumentDarkClass);

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
    {
      path: homePath,
      component: () => import("./landing.ts").then((m) => m.landing()),
      meta: routeMetaByPath[homePath],
    },
    {
      path: chatPath,
      component: () => import("./chat.ts").then((m) => m.chat()),
      meta: routeMetaByPath[chatPath],
    },
    {
      path: docsPath,
      component: () => import("./guide.ts").then((m) => m.guide()),
      meta: routeMetaByPath[docsPath],
    },
    {
      path: guidePath,
      component: () => import("./guide.ts").then((m) => m.guide()),
      meta: routeMetaByPath[guidePath],
    },
    {
      path: comparePath,
      component: () => import("./compare.ts").then((m) => m.compare()),
      meta: routeMetaByPath[comparePath],
    },
    {
      path: legalPath,
      component: () => import("./legal.ts").then((m) => m.legal()),
      meta: routeMetaByPath[legalPath],
    },
    {
      path: privacyPath,
      component: () => import("./legal.ts").then((m) => m.privacy()),
      meta: routeMetaByPath[privacyPath],
    },
    {
      path: termsPath,
      component: () => import("./legal.ts").then((m) => m.terms()),
      meta: routeMetaByPath[termsPath],
    },
    {
      path: manifestoPath,
      component: () => import("./manifesto.ts").then((m) => m.manifesto()),
      meta: routeMetaByPath[manifestoPath],
    },
    {
      path: mcpGuidePath,
      component: () => import("./mcp-guide.ts").then((m) => m.mcpGuide()),
      meta: routeMetaByPath[mcpGuidePath],
    },
  ],
  notFound,
});
