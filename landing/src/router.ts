import { render, type TemplateResult } from "lit";

import type { RouteMeta } from "./route-meta.ts";

type Route = {
  path: string;
  component: () => TemplateResult | Promise<TemplateResult>;
  meta?: RouteMeta;
};

const siteOrigin = "https://aliceandbot.com";

const normalizePath = (pathname: string) =>
  pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;

const setMetaTag = (attr: "name" | "property", key: string, value: string) => {
  const el = document.querySelector(`meta[${attr}="${key}"]`);
  if (el) el.setAttribute("content", value);
};

const applyRouteMeta = (pathname: string, meta?: RouteMeta) => {
  if (typeof document === "undefined" || !meta) return;
  document.title = meta.title;
  setMetaTag("name", "description", meta.description);
  setMetaTag("property", "og:title", meta.title);
  setMetaTag("property", "og:description", meta.description);
  setMetaTag("name", "twitter:title", meta.title);
  setMetaTag("name", "twitter:description", meta.description);
  const canonicalUrl = `${siteOrigin}${meta.canonicalPath ?? pathname}`;
  setMetaTag("property", "og:url", canonicalUrl);
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) canonical.setAttribute("href", canonicalUrl);
};

let routes: Route[] = [];
let notFound: () => TemplateResult;
let rootEl: HTMLElement;
let currentLeave: (() => void) | null = null;

const matchRoute = (pathname: string) =>
  routes.find(({ path }) => path === normalizePath(pathname));

let currentPath = "";

const renderRoute = () => {
  (async () => {
    const pathname = normalizePath(globalThis.location.pathname);
    if (pathname === currentPath) return;
    if (currentLeave) {
      currentLeave();
      currentLeave = null;
    }
    currentPath = pathname;
    const match = matchRoute(pathname);
    applyRouteMeta(pathname, match?.meta);
    const template = match ? await match.component() : notFound();
    render(template, rootEl);
  })().catch((err) => {
    console.error("Failed to render route", err);
  });
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
