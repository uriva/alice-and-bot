import type { Credentials } from "../../protocol/src/clientApi.ts";
import {
  loadCredentials,
  loadOrCreateCredentials,
} from "../../lit/core/credentials.ts";
import {
  type DarkModeOverride,
  setDarkModeOverride,
  subscribeDarkMode,
} from "../../lit/core/dark-mode.ts";
import { subscribeIsMobile } from "../../lit/core/responsive.ts";
import { getOrCreateConversation } from "../../lit/core/subscriptions.ts";
import "../../lit/components/connected-chat.ts";

const fontStack = [
  "Inter",
  "ui-sans-serif",
  "system-ui",
  "-apple-system",
  "Segoe UI",
  "Roboto",
  "Ubuntu",
  "Cantarell",
  "Noto Sans",
  "Helvetica Neue",
  "Arial",
  "Apple Color Emoji",
  "Segoe UI Emoji",
].join(", ");

export type WidgetMode = "light" | "dark";

export type ExportedWidgetModeColors = {
  primary: string;
  background: string;
  startButton: string;
  startButtonText: string;
};

export type WidgetModeColors = {
  background: string;
  text: string;
  surface: string;
  border: string;
  overlay: string;
  primary: string;
  primaryText: string;
  neutralBg: string;
  neutralText: string;
  startButton: string;
  startButtonText: string;
  startShadow: string;
  inputBackground: string;
  inputBorder: string;
  inputText: string;
};

export type WidgetColorScheme = {
  light?: Partial<ExportedWidgetModeColors>;
  dark?: Partial<ExportedWidgetModeColors>;
};

const defaultColors: Record<WidgetMode, WidgetModeColors> = {
  light: {
    background: "#ffffff",
    text: "#111827",
    surface: "#ffffff",
    border: "#d1d5db",
    overlay: "rgba(0,0,0,0.4)",
    primary: "hsl(170,55%,45%)",
    primaryText: "#ffffff",
    neutralBg: "#e5e7eb",
    neutralText: "#111827",
    startButton: "hsl(170,55%,45%)",
    startButtonText: "#ffffff",
    startShadow: "0 2px 8px rgba(20, 80, 70, 0.2)",
    inputBackground: "#ffffff",
    inputBorder: "#d1d5db",
    inputText: "#111827",
  },
  dark: {
    background: "#2a2a2a",
    text: "#f3f4f6",
    surface: "#2a2a2a",
    border: "#4b5563",
    overlay: "rgba(0,0,0,0.4)",
    primary: "hsl(170,42%,24%)",
    primaryText: "#ffffff",
    neutralBg: "#4b5563",
    neutralText: "#f9fafb",
    startButton: "hsl(170,42%,24%)",
    startButtonText: "#ffffff",
    startShadow: "0 2px 8px rgba(10, 30, 25, 0.4)",
    inputBackground: "#1e1e1e",
    inputBorder: "#4b5563",
    inputText: "#f9fafb",
  },
};

type ResolvedAppearance = {
  mode: WidgetMode;
  colors: WidgetModeColors;
  colorSchemeValue: "light" | "dark" | "light dark";
};

const resolveAppearance = (
  colorScheme: WidgetColorScheme | undefined,
  prefersDark: boolean,
): ResolvedAppearance => {
  const hasLight = !!colorScheme?.light;
  const hasDark = !!colorScheme?.dark;
  const mode: WidgetMode = hasLight && hasDark
    ? prefersDark ? "dark" : "light"
    : hasDark
    ? "dark"
    : hasLight
    ? "light"
    : prefersDark
    ? "dark"
    : "light";
  const colors = { ...defaultColors[mode], ...(colorScheme?.[mode] ?? {}) };
  const colorSchemeValue: "light" | "dark" | "light dark" = hasLight && hasDark
    ? "light dark"
    : mode;
  return { mode, colors, colorSchemeValue };
};

const widgetBaseCss = (colorScheme: "light" | "dark" | "light dark") => `
:host, *, *::before, *::after { font-family: ${fontStack}; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility; }
:host { color-scheme: ${colorScheme}; }
`;

import {
  buttonNeutralCss,
  buttonPrimaryCss,
  closeButtonCss,
  dialogBoxCss,
  fieldCss,
} from "./styles.ts";

const startButtonCss = (colors: WidgetModeColors) =>
  `width:48px;height:48px;border-radius:50%;border:none;background:${colors.startButton};color:${colors.startButtonText};cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 2px 8px ${colors.startShadow}`;

const containerCss = (
  { isMobile, isDark, isOpen, viewportHeight }: {
    isMobile: boolean;
    isDark: boolean;
    isOpen: boolean;
    viewportHeight?: number;
  },
) =>
  isOpen
    ? isMobile
      ? `position:absolute;top:0;left:0;width:100%;height:${
        viewportHeight ? `${viewportHeight}px` : "100%"
      };display:flex;flex-direction:column;overflow:hidden;background:#fff`
      : `position:absolute;right:24px;bottom:24px;flex-direction:column;width:min(400px, 90vw);height:min(80dvh, 720px);max-width:calc(100vw - 48px);max-height:calc(100dvh - 48px);box-shadow:${
        isDark ? "0 10px 30px rgba(0,0,0,0.5)" : "0 10px 30px rgba(0,0,0,0.12)"
      };display:flex;border-radius:12px;overflow:hidden`
    : "position:absolute;right:24px;bottom:24px;display:flex;flex-direction:column";

const chatWrapperCss =
  "display:flex;flex-direction:column;width:100%;height:100%;min-height:0;overflow:hidden";

const overlayCss = (colors: WidgetModeColors) =>
  `position:fixed;inset:0;z-index:10002;background:${colors.overlay};display:flex;align-items:center;justify-content:center;padding:16px;font-family:${fontStack}`;

const toastCss =
  "position:fixed;top:24px;left:50%;transform:translateX(-50%);z-index:10003;background:#ef4444;color:#fff;padding:10px 20px;border-radius:8px;font-size:14px;font-family:sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.15);pointer-events:none;transition:opacity 0.3s";

const spinnerKeyframes =
  `@keyframes widget-spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}`;
const spinnerCss =
  "width:24px;height:24px;border:3px solid #e5e7eb;border-top-color:#6366f1;border-radius:50%;animation:widget-spin 0.8s linear infinite";

export type WidgetParams = {
  participants: string[];
  initialMessage?: string;
  startOpen?: boolean;
  buttonText?: string;
  defaultName?: string;
  colorScheme?: WidgetColorScheme;
  enableVoiceCall?: boolean;
};

const showToast = (text: string) => {
  const el = document.createElement("div");
  el.style.cssText = toastCss;
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 300);
  }, 2500);
};

const setHostStyles = (
  host: HTMLDivElement,
  isOpen: boolean,
  isMobile: boolean,
) => {
  if (isOpen && isMobile) {
    host.style.setProperty("inset", "0", "important");
    host.style.setProperty("width", "100%", "important");
    host.style.setProperty("height", "100%", "important");
    host.style.setProperty("overflow", "hidden", "important");
  } else {
    host.style.setProperty("top", "", "important");
    host.style.setProperty("inset", "auto 0 0 auto", "important");
    host.style.setProperty("width", "0", "important");
    host.style.setProperty("height", "0", "important");
    host.style.setProperty("overflow", "visible", "important");
  }
};

const lockBodyScroll = () => {
  const original = {
    overflow: document.body.style.overflow,
    position: document.body.style.position,
    height: document.body.style.height,
  };
  document.body.style.overflow = "hidden";
  document.body.style.position = "fixed";
  document.body.style.height = "100%";
  return () => {
    document.body.style.overflow = original.overflow;
    document.body.style.position = original.position;
    document.body.style.height = original.height;
  };
};

const darkModeOverrideForScheme = (
  colorScheme: WidgetColorScheme | undefined,
): DarkModeOverride => {
  const hasLight = !!colorScheme?.light;
  const hasDark = !!colorScheme?.dark;
  if (hasLight && hasDark) return null;
  if (hasDark) return "dark";
  if (hasLight) return "light";
  return null;
};

const renderNameDialog = (
  { colors, mode, onClose, onSubmit }: {
    colors: WidgetModeColors;
    mode: WidgetMode;
    onClose: () => void;
    onSubmit: (name: string) => void;
  },
) => {
  const overlay = document.createElement("div");
  overlay.style.cssText = overlayCss(colors);
  overlay.addEventListener("click", onClose);

  const dialog = document.createElement("div");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.style.cssText = dialogBoxCss({ colors, mode });
  dialog.addEventListener("click", (e) => e.stopPropagation());

  const title = document.createElement("div");
  title.setAttribute("data-testid", "name-dialog-title");
  title.style.cssText = "font-size:18px;font-weight:700;text-align:center";
  title.textContent = "Enter your display name";

  const hint = document.createElement("div");
  hint.style.cssText = "font-size:13px;opacity:0.9;text-align:center";
  hint.textContent = "This will be shown to others.";

  const input = document.createElement("input");
  input.placeholder = "Your name";
  input.style.cssText = fieldCss(colors) + ";text-align:center";

  const actions = document.createElement("div");
  actions.style.cssText =
    "display:flex;gap:8px;justify-content:center;width:100%;margin-top:4px";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.style.cssText = buttonNeutralCss(colors);
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", onClose);

  const continueBtn = document.createElement("button");
  continueBtn.type = "button";
  continueBtn.style.cssText = buttonPrimaryCss(colors);
  continueBtn.textContent = "Continue";

  const submit = () => {
    const v = input.value.trim();
    if (!v) {
      showToast("Please enter your name");
      return;
    }
    onSubmit(v);
  };

  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    submit();
  });
  continueBtn.addEventListener("click", submit);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  };
  globalThis.addEventListener("keydown", onKey);

  actions.append(cancelBtn, continueBtn);
  dialog.append(title, hint, input, actions);
  overlay.append(dialog);
  document.body.appendChild(overlay);
  input.focus();

  return () => {
    globalThis.removeEventListener("keydown", onKey);
    overlay.remove();
  };
};

const renderLoading = (_shadow: ShadowRoot) => {
  const wrapper = document.createElement("div");
  wrapper.style.cssText =
    "height:100%;display:flex;align-items:center;justify-content:center";
  const style = document.createElement("style");
  style.textContent = spinnerKeyframes;
  const spinner = document.createElement("div");
  spinner.style.cssText = spinnerCss;
  wrapper.append(style, spinner);
  return wrapper;
};

export const createWidget = (
  params: WidgetParams,
): { element: HTMLDivElement; destroy: () => void } => {
  const {
    participants,
    startOpen,
    buttonText,
    defaultName,
    colorScheme,
  } = params;

  let isOpen = false;
  let isMobile = false;
  let isDark = false;
  let credentials: Credentials | null = null;
  let conversationId: string | null = null;
  let viewportHeight: number | undefined;
  let nameDialogCleanup: (() => void) | null = null;
  let bodyScrollUnlock: (() => void) | null = null;
  let conversationUnsub: (() => void) | null = null;

  const host = document.createElement("div");
  host.setAttribute("dir", "ltr");
  host.style.setProperty("display", "block", "important");
  host.style.setProperty("position", "fixed", "important");
  host.style.setProperty("z-index", "999999", "important");
  host.style.setProperty("pointer-events", "none", "important");
  const shadow = host.attachShadow({ mode: "open" });

  const styleEl = document.createElement("style");
  const containerEl = document.createElement("div");
  containerEl.style.cssText = "pointer-events:auto";
  shadow.append(styleEl, containerEl);

  setHostStyles(host, false, false);

  const appearance = () => resolveAppearance(colorScheme, isDark);

  const updateShadowContent = () => {
    const app = appearance();
    styleEl.textContent = widgetBaseCss(app.colorSchemeValue);
    containerEl.style.cssText = containerCss({
      isMobile,
      isDark: app.mode === "dark",
      isOpen,
      viewportHeight: isMobile && isOpen ? viewportHeight : undefined,
    }) + ";pointer-events:auto" +
      (isOpen ? `;background:${app.colors.surface}` : "");

    containerEl.innerHTML = "";

    if (isOpen) {
      const closeBtn = document.createElement("span");
      closeBtn.setAttribute("data-testid", "widget-close-button");
      closeBtn.setAttribute("role", "button");
      closeBtn.setAttribute("aria-label", "Close chat");
      closeBtn.style.cursor = "pointer";
      closeBtn.style.cssText = closeButtonCss({
        colors: app.colors,
      });
      closeBtn.textContent = "\u00d7";
      closeBtn.addEventListener("click", () => setChatOpen(false));
      containerEl.appendChild(closeBtn);

      if (credentials && conversationId) {
        const chatWrapper = document.createElement("div");
        chatWrapper.style.cssText = chatWrapperCss;
        const chat = document.createElement(
          "alice-connected-chat",
        ) as HTMLElement & Record<string, unknown>;
        chat.credentials = credentials;
        chat.conversationId = conversationId;
        chat.darkModeOverride = app.mode === "dark";
        chat.isDark = app.mode === "dark";
        chat.enableVoiceCall = params.enableVoiceCall ?? false;
        chat.customColors = {
          background: app.colors.background,
          text: app.colors.text,
          primary: app.colors.primary,
          otherBubble: app.colors.surface,
          inputBackground: app.colors.inputBackground,
        };
        chatWrapper.appendChild(chat);
        containerEl.appendChild(chatWrapper);
      } else {
        containerEl.appendChild(renderLoading(shadow));
      }
    } else {
      const startBtn = document.createElement("button");
      startBtn.setAttribute("data-testid", "widget-start-button");
      startBtn.type = "button";
      startBtn.style.cssText = startButtonCss(app.colors);
      startBtn.innerHTML = buttonText ??
        `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
      startBtn.addEventListener("click", () => {
        if (credentials) return setChatOpen(true);
        openNameDialog();
      });
      containerEl.appendChild(startBtn);
    }
  };

  const setChatOpen = (open: boolean) => {
    isOpen = open;
    setHostStyles(host, isOpen, isMobile);
    if (bodyScrollUnlock) {
      bodyScrollUnlock();
      bodyScrollUnlock = null;
    }
    if (isOpen && isMobile) bodyScrollUnlock = lockBodyScroll();
    updateShadowContent();
  };

  const closeNameDialog = () => {
    if (!nameDialogCleanup) return;
    nameDialogCleanup();
    nameDialogCleanup = null;
  };

  const onNameSubmitted = (name: string) => {
    closeNameDialog();
    loadCredentialsForName(name);
    setChatOpen(true);
  };

  const openNameDialog = () => {
    if (nameDialogCleanup) return;
    const app = appearance();
    nameDialogCleanup = renderNameDialog({
      colors: app.colors,
      mode: app.mode,
      onClose: closeNameDialog,
      onSubmit: onNameSubmitted,
    });
  };

  const subscribeConversation = () => {
    conversationUnsub?.();
    conversationUnsub = null;
    if (!credentials) return;
    conversationUnsub = getOrCreateConversation(
      credentials,
      participants,
      (id) => {
        conversationId = id;
        updateShadowContent();
      },
    );
  };

  const loadCredentialsForName = (name: string) => {
    loadOrCreateCredentials(name, "aliceAndBotCredentials").then((creds) => {
      if (!creds) return;
      credentials = creds;
      subscribeConversation();
      updateShadowContent();
    });
  };

  const escapeHandler = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    if (isOpen) setChatOpen(false);
  };
  globalThis.addEventListener("keydown", escapeHandler);

  setDarkModeOverride(darkModeOverrideForScheme(colorScheme));
  const unsubDark = subscribeDarkMode((dark) => {
    isDark = dark;
    updateShadowContent();
  });

  const unsubMobile = subscribeIsMobile((mobile) => {
    if (mobile === isMobile) return;
    isMobile = mobile;
    setHostStyles(host, isOpen, isMobile);
    if (bodyScrollUnlock) {
      bodyScrollUnlock();
      bodyScrollUnlock = null;
    }
    if (isOpen && isMobile) bodyScrollUnlock = lockBodyScroll();
    updateShadowContent();
  });

  const setupViewport = () => {
    const vv = globalThis.visualViewport;
    if (!vv) return () => {};
    const update = () => {
      viewportHeight = vv.height;
      if (isMobile && isOpen) {
        containerEl.style.cssText = containerCss({
          isMobile,
          isDark: appearance().mode === "dark",
          isOpen,
          viewportHeight,
        }) + ";pointer-events:auto";
      }
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    update();
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  };
  const unsubViewport = setupViewport();

  const existingCreds = loadCredentials("aliceAndBotCredentials");
  if (existingCreds) {
    credentials = existingCreds;
    subscribeConversation();
  }

  if (defaultName) {
    loadCredentialsForName(defaultName);
    if (startOpen) {
      const waitForCreds = () => {
        if (credentials) {
          setChatOpen(true);
          return;
        }
        requestAnimationFrame(waitForCreds);
      };
      loadOrCreateCredentials(defaultName, "aliceAndBotCredentials").then(
        (creds) => {
          if (!creds) return;
          credentials = creds;
          subscribeConversation();
          setChatOpen(true);
        },
      );
    }
  } else if (startOpen) {
    if (credentials) {
      setChatOpen(true);
    } else {
      openNameDialog();
    }
  }

  updateShadowContent();

  return {
    element: host,
    destroy: () => {
      globalThis.removeEventListener("keydown", escapeHandler);
      unsubDark();
      unsubMobile();
      unsubViewport();
      conversationUnsub?.();
      closeNameDialog();
      if (bodyScrollUnlock) bodyScrollUnlock();
      setDarkModeOverride(null);
    },
  };
};
