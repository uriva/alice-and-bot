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
  });
  globalThis.addEventListener("appinstalled", () => {
    pwaState.deferredPrompt = null;
  });
};

export const triggerPwaInstall = async (): Promise<
  "installed" | "dismissed" | "ios-instructions" | "opened-chat"
> => {
  if (pwaState.deferredPrompt) {
    const promptEvent = pwaState.deferredPrompt;
    pwaState.deferredPrompt = null;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === "accepted") {
      navigate(chatPath);
      return "installed";
    }
    return "dismissed";
  }
  if (isIosDevice() && !isStandaloneApp()) {
    navigate(chatPath);
    return "ios-instructions";
  }
  navigate(chatPath);
  return "opened-chat";
};
