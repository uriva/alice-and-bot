import { type AnyComponent, render } from "preact";
import { ErrorBoundary, LocationProvider, Route, Router } from "preact-iso";
import { Toaster } from "react-hot-toast";
import { Messenger } from "./chat.tsx";
import { LandingPage } from "./landing.tsx";
import { Legal } from "./legal.tsx";
import { chatPath, homePath, manifestoPath } from "./paths.ts";
import { Manifesto } from "./manifesto.tsx";

const routes: { path: string; component: AnyComponent }[] = [
  { path: homePath, component: LandingPage },
  { path: chatPath, component: Messenger },
  { path: "/legal", component: Legal },
  { path: manifestoPath, component: Manifesto },
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
      class="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
    >
      Go to Home
    </a>
  </div>
);

const App = () => (
  <LocationProvider>
    <Toaster />
    <ErrorBoundary>
      <Router>
        {routes.map(({ path, component }) => (
          <Route path={path} component={component} />
        ))}
        <Route default component={NotFound} />
      </Router>
    </ErrorBoundary>
  </LocationProvider>
);

render(<App />, document.getElementById("root")!);
