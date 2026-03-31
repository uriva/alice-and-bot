import type { AnyComponent } from "preact";
import hydrate from "preact-iso/hydrate";
import { ErrorBoundary, LocationProvider, Route, Router } from "preact-iso";
import { Toaster } from "react-hot-toast";
import { Messenger } from "./chat.tsx";
import { Docs } from "./guide.tsx";
import { LandingPage } from "./landing.tsx";
import { Legal } from "./legal.tsx";
import {
  chatPath,
  claudeCodePath,
  docsPath,
  guidePath,
  homePath,
  manifestoPath,
  mcpGuidePath,
  opencodePath,
} from "./paths.ts";
import { Manifesto } from "./manifesto.tsx";
import { McpGuide } from "./mcp-guide.tsx";
import { ClaudeCode } from "./claude-code.tsx";
import { OpenCodePage } from "./opencode.tsx";
import "./app.css";

const routes: { path: string; component: AnyComponent }[] = [
  { path: homePath, component: LandingPage },
  { path: chatPath, component: Messenger },
  { path: docsPath, component: Docs },
  { path: guidePath, component: Docs },
  { path: "/legal", component: Legal },
  { path: manifestoPath, component: Manifesto },
  { path: mcpGuidePath, component: McpGuide },
  { path: claudeCodePath, component: ClaudeCode },
  { path: opencodePath, component: OpenCodePage },
];

const NotFound = () => (
  <div class="flex flex-col items-center justify-center w-full h-full">
    <h1 class="text-4xl font-bold text-gray-800 dark:text-gray-200">
      404 - Not Found
    </h1>
    <p class="text-lg text-gray-600 dark:text-gray-400">
      The page you are looking for does not exist.
    </p>
    <a
      href={homePath}
      class="mt-4 px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-900 dark:bg-gray-300 dark:text-gray-900 dark:hover:bg-gray-400"
    >
      Go to Home
    </a>
  </div>
);

const App = () => (
  <>
    <Toaster />
    <ErrorBoundary>
      <Router>
        {routes.map(({ path, component }) => (
          <Route path={path} component={component} />
        ))}
        <Route default component={NotFound} />
      </Router>
    </ErrorBoundary>
  </>
);

export const App_ = () => (
  <LocationProvider>
    <App />
  </LocationProvider>
);

if (
  typeof window !== "undefined" &&
  location.pathname.startsWith(chatPath)
) {
  document.querySelector("script[type=isodata]")?.remove();
}

hydrate(<App_ />);
