import { useEffect, useState } from "preact/hooks";
import { FaDiscord, FaGithub, FaMoon, FaSun } from "react-icons/fa";
import { Button } from "./components.tsx";
import {
  chatPath,
  docsPath,
  homePath,
  manifestoPath,
  mcpGuidePath,
} from "./paths.ts";

const isDark = () =>
  typeof document !== "undefined" &&
  document.documentElement.classList.contains("dark");

const useDarkMode = () => {
  const [dark, setDark] = useState(isDark);
  useEffect(() => {
    const root = document.documentElement;
    if (dark) root.classList.add("dark");
    else root.classList.remove("dark");
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);
  return [dark, () => setDark((d) => !d)] as const;
};

const navLinks = [
  { href: docsPath, label: "Docs" },
  { href: mcpGuidePath, label: "MCP" },
  { href: chatPath, label: "Chat" },
  { href: manifestoPath, label: "Manifesto" },
];

const navLinkClass =
  "text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors";

const iconButtonClass =
  "p-2 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors";

const NavLinks = () => (
  <>
    {navLinks.map(({ href, label }) => (
      <a key={href} href={href} class={navLinkClass}>{label}</a>
    ))}
  </>
);

const MobileMenu = ({ open }: { open: boolean }) =>
  !open
    ? null
    : (
      <div class="md:hidden border-t border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md">
        <nav class="flex flex-col px-4 py-3 gap-2">
          <NavLinks />
          <a
            href="https://github.com/uriva/alice-and-bot"
            target="_blank"
            rel="noopener noreferrer"
            class={navLinkClass}
          >
            GitHub
          </a>
        </nav>
      </div>
    );

const HamburgerIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
    <path
      d="M3 5h14M3 10h14M3 15h14"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      fill="none"
    />
  </svg>
);

const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
    <path
      d="M5 5l10 10M15 5L5 15"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      fill="none"
    />
  </svg>
);

export const Header = () => {
  const [dark, toggleDark] = useDarkMode();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header class="sticky top-0 z-50 w-full border-b border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md">
      <div class="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <a href={homePath} class="flex items-center gap-2 shrink-0">
          <img src="/icon.png" alt="Alice&Bot" class="w-7 h-7" />
          <span class="font-bold text-gray-900 dark:text-gray-100 text-lg">
            Alice&Bot
          </span>
        </a>
        <nav class="hidden md:flex items-center gap-6">
          <NavLinks />
        </nav>
        <div class="flex items-center gap-1">
          <a
            href="https://github.com/uriva/alice-and-bot"
            target="_blank"
            rel="noopener noreferrer"
            class={`hidden md:flex ${iconButtonClass}`}
            aria-label="GitHub"
          >
            <FaGithub size={18} />
          </a>
          <a
            href="https://discord.gg/xkGMFH9RAz"
            target="_blank"
            rel="noopener noreferrer"
            class={`hidden md:flex ${iconButtonClass}`}
            aria-label="Discord"
          >
            <FaDiscord size={18} />
          </a>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleDark}
            className={iconButtonClass}
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {dark ? <FaSun size={18} /> : <FaMoon size={18} />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={`md:hidden ${iconButtonClass}`}
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            {menuOpen ? <CloseIcon /> : <HamburgerIcon />}
          </Button>
        </div>
      </div>
      <MobileMenu open={menuOpen} />
    </header>
  );
};
