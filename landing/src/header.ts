import { html, type TemplateResult } from "lit";
import { setDarkModeOverride } from "../../lit/core/dark-mode.ts";
import { buttonClass } from "./components.ts";
import {
  chatPath,
  claudeCodePath,
  docsPath,
  homePath,
  manifestoPath,
  mcpGuidePath,
  opencodePath,
} from "./paths.ts";

const isDark = () =>
  typeof document !== "undefined" &&
  document.documentElement.classList.contains("dark");

const githubSvg = html`
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path
      d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.605-.015 2.896-.015 3.286 0 .315.21.694.825.576C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12z"
    />
  </svg>
`;

const discordSvg = html`
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path
      d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.182 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"
    />
  </svg>
`;

const sunSvg = html`
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
`;

const moonSvg = html`
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
`;

const navLinks = [
  { href: manifestoPath, label: "Manifesto" },
  { href: docsPath, label: "Docs" },
  { href: claudeCodePath, label: "Claude Code" },
  { href: opencodePath, label: "OpenCode" },
  { href: mcpGuidePath, label: "MCP" },
];

const navLinkClass = (isActive: boolean) =>
  `text-sm font-medium px-2 py-1 rounded-md transition-colors ${
    isActive
      ? "text-gray-900 dark:text-white bg-gray-100 dark:bg-[#1a1a1a]"
      : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-[#1a1a1a]/50"
  }`;

const messengerLinkClass =
  "text-sm font-semibold px-3 py-1.5 bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 rounded-md hover:bg-gray-900 dark:hover:bg-gray-300 transition-colors";

const iconButtonClass =
  "p-2 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#1a1a1a] transition-colors";

const currentPath = () =>
  typeof globalThis.location !== "undefined"
    ? globalThis.location.pathname
    : "";

const navLinksTemplate = () =>
  navLinks.map(({ href, label }) =>
    html`
      <a href="${href}" class="${navLinkClass(
        currentPath() === href,
      )}">${label}</a>
    `
  );

const hamburgerIcon = html`
  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
    <path
      d="M3 5h14M3 10h14M3 15h14"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      fill="none"
    />
  </svg>
`;

const closeIcon = html`
  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
    <path
      d="M5 5l10 10M15 5L5 15"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      fill="none"
    />
  </svg>
`;

const mobileMenu = (open: boolean) =>
  !open
    ? html`

    `
    : html`
      <div
        class="md:hidden border-t border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-[#111]/95 backdrop-blur-md overflow-y-auto max-h-[calc(100vh-3.5rem)]"
      >
        <nav class="flex flex-col px-4 py-3 gap-2">
          <a href="${chatPath}" class="${messengerLinkClass}">Messenger</a>
          ${navLinksTemplate()}
          <a
            href="https://github.com/uriva/alice-and-bot"
            target="_blank"
            rel="noopener noreferrer"
            class="${navLinkClass(false)}"
          >GitHub</a>
        </nav>
      </div>
    `;

const toggleDark = () => {
  const root = document.documentElement;
  const dark = !isDark();
  if (dark) root.classList.add("dark");
  else root.classList.remove("dark");
  localStorage.setItem("theme", dark ? "dark" : "light");
  setDarkModeOverride(dark ? "dark" : "light");
  rerenderHeader();
};

let menuOpen = false;
const toggleMenu = () => {
  menuOpen = !menuOpen;
  rerenderHeader();
};

let headerContainer: HTMLElement | null = null;

const headerTemplate = (): TemplateResult =>
  html`
    <header
      class="sticky top-0 z-50 w-full border-b border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-[#111]/80 backdrop-blur-md"
    >
      <div class="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <a href="${homePath}" class="flex items-center gap-2 shrink-0">
          <img src="/icon.png" alt="Alice&Bot" class="w-7 h-7" />
          <span class="font-bold text-gray-900 dark:text-gray-100 text-lg"
          >Alice&Bot</span>
        </a>
        <nav class="hidden md:flex items-center gap-6">
          ${navLinksTemplate()}
        </nav>
        <div class="flex items-center gap-1">
          <a href="${chatPath}" class="hidden md:flex mr-2 ${messengerLinkClass}"
          >Messenger</a>
          <a
            href="https://github.com/uriva/alice-and-bot"
            target="_blank"
            rel="noopener noreferrer"
            class="hidden md:flex ${iconButtonClass}"
            aria-label="GitHub"
          >${githubSvg}</a>
          <a
            href="https://discord.gg/xkGMFH9RAz"
            target="_blank"
            rel="noopener noreferrer"
            class="hidden md:flex ${iconButtonClass}"
            aria-label="Discord"
          >${discordSvg}</a>
          <button
            type="button"
            @click="${toggleDark}"
            class="${buttonClass("ghost", "icon", iconButtonClass)}"
            aria-label="${isDark()
              ? "Switch to light mode"
              : "Switch to dark mode"}"
          >
            ${isDark() ? sunSvg : moonSvg}
          </button>
          <button
            type="button"
            class="md:hidden ${buttonClass("ghost", "icon", iconButtonClass)}"
            @click="${toggleMenu}"
            aria-label="Toggle menu"
          >
            ${menuOpen ? closeIcon : hamburgerIcon}
          </button>
        </div>
      </div>
      ${mobileMenu(menuOpen)}
    </header>
  `;

import { render } from "lit";

const rerenderHeader = () => {
  if (headerContainer) render(headerTemplate(), headerContainer);
};

export const header = (): TemplateResult => {
  const id = "header-mount";
  setTimeout(() => {
    headerContainer = document.getElementById(id);
    rerenderHeader();
  });
  return html`
    <div id="${id}"></div>
  `;
};
