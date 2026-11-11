import { chatPath } from "./paths.ts";
import { navigate } from "./router.ts";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const isBeforeInstallPromptEvent = (
  e: Event,
): e is BeforeInstallPromptEvent =>
  "prompt" in e && typeof e.prompt === "function";

const listeners = new Set<() => void>();

const notifyListeners = () => {
  listeners.forEach((fn) => fn());
};

const pwaState: {
  deferredPrompt: BeforeInstallPromptEvent | null;
  initialized: boolean;
} = {
  deferredPrompt: null,
  initialized: false,
};

export const isStandaloneApp = () =>
  Boolean(
    globalThis.matchMedia?.("(display-mode: standalone)").matches ||
      ("standalone" in navigator && navigator.standalone === true),
  );

export const isIosDevice = () =>
  /iPhone|iPad|iPod/i.test(globalThis.navigator?.userAgent ?? "");

export const hasInstallPrompt = () => Boolean(pwaState.deferredPrompt);

export const canInstallPwa = () =>
  !isStandaloneApp() && (hasInstallPrompt() || isIosDevice());

export const subscribePwaInstall = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export const initPwaInstall = () => {
  if (pwaState.initialized || typeof globalThis.document === "undefined") {
    return;
  }
  pwaState.initialized = true;
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
  globalThis.addEventListener("beforeinstallprompt", (e) => {
    if (!isBeforeInstallPromptEvent(e)) return;
    e.preventDefault();
    pwaState.deferredPrompt = e;
    notifyListeners();
  });
  globalThis.addEventListener("appinstalled", () => {
    pwaState.deferredPrompt = null;
    notifyListeners();
  });
};

export const triggerPwaInstall = async (
  { stayOnPage = false }: { stayOnPage?: boolean } = {},
): Promise<
  "installed" | "dismissed" | "ios-instructions" | "browser-menu"
> => {
  if (pwaState.deferredPrompt) {
    const promptEvent = pwaState.deferredPrompt;
    pwaState.deferredPrompt = null;
    notifyListeners();
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === "accepted") {
      if (!stayOnPage) navigate(chatPath);
      return "installed";
    }
    return "dismissed";
  }
  if (!stayOnPage) navigate(chatPath);
  return isIosDevice() && !isStandaloneApp()
    ? "ios-instructions"
    : "browser-menu";
};
