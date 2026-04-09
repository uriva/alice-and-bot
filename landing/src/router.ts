import { render, type TemplateResult } from "lit";

type Route = {
  path: string;
  component: () => TemplateResult | Promise<TemplateResult>;
};

let routes: Route[] = [];
let notFound: () => TemplateResult;
let rootEl: HTMLElement;
let currentLeave: (() => void) | null = null;

const matchRoute = (pathname: string) =>
  routes.find(({ path }) => path === pathname);

let currentPath = "";

const renderRoute = async () => {
  const pathname = globalThis.location.pathname;
  if (pathname === currentPath) return;
  if (currentLeave) {
    currentLeave();
    currentLeave = null;
  }
  currentPath = pathname;
  const match = matchRoute(pathname);
  const template = match ? await match.component() : notFound();
  render(template, rootEl);
};

const isLocalLink = (el: HTMLAnchorElement) =>
  el.href &&
  el.origin === globalThis.location.origin &&
  !el.hasAttribute("download") &&
  el.target !== "_blank";

const findAnchor = (e: Event): HTMLAnchorElement | null => {
  const path = e.composedPath();
  for (let i = 0; i < path.length; i++) {
    const node = path[i];
    if (node instanceof HTMLAnchorElement) return node;
  }
  return null;
};

const handleClick = (e: MouseEvent) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey) return;
  const anchor = findAnchor(e);
  if (!anchor || !isLocalLink(anchor)) return;
  if (anchor.pathname === globalThis.location.pathname) {
    e.preventDefault();
    return;
  }
  e.preventDefault();
  navigate(anchor.href);
};

export const navigate = (url: string, replace = false) => {
  const method = replace ? "replaceState" : "pushState";
  globalThis.history[method](null, "", url);
  renderRoute();
};

export const onRouteLeave = (fn: () => void) => {
  currentLeave = fn;
};

export const initRouter = (
  config: {
    root: HTMLElement;
    routes: Route[];
    notFound: () => TemplateResult;
  },
) => {
  rootEl = config.root;
  routes = config.routes;
  notFound = config.notFound;
  globalThis.addEventListener("popstate", renderRoute);
  globalThis.addEventListener("click", handleClick);
  renderRoute();
};

export const currentQuery = () =>
  Object.fromEntries(new URLSearchParams(globalThis.location.search));
