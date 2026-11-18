import {
  type ClientsLike,
  handleServiceWorkerNotificationClick,
  handleServiceWorkerPush,
  type NotificationRegistrationLike,
  type PushPayloadData,
} from "../../protocol/src/pushNotification.ts";

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

const hasWaitUntil = (
  e: unknown,
): e is { waitUntil: (promise: Promise<unknown>) => void } =>
  isObject(e) && typeof e.waitUntil === "function";

const getRegistration = (): NotificationRegistrationLike | null => {
  const reg: unknown = Reflect.get(globalThis, "registration");
  if (!isObject(reg)) return null;
  const showFn = reg.showNotification;
  const getFn = reg.getNotifications;
  if (typeof showFn !== "function" || typeof getFn !== "function") return null;
  return {
    showNotification: (title, options) => showFn.call(reg, title, options),
    getNotifications: (filter) => getFn.call(reg, filter),
  };
};

const getClients = ():
  | (ClientsLike & { claim?: () => Promise<unknown> })
  | null => {
  const c: unknown = Reflect.get(globalThis, "clients");
  if (!isObject(c)) return null;
  const matchAllFn = c.matchAll;
  if (typeof matchAllFn !== "function") return null;
  const openWindowFn = c.openWindow;
  const claimFn = c.claim;
  return {
    matchAll: (opts) => matchAllFn.call(c, opts),
    ...(typeof openWindowFn === "function"
      ? { openWindow: (url: string) => openWindowFn.call(c, url) }
      : {}),
    ...(typeof claimFn === "function" ? { claim: () => claimFn.call(c) } : {}),
  };
};

const setSwAppBadge = (count: number): Promise<unknown> =>
  "navigator" in globalThis &&
    isObject(globalThis.navigator) &&
    typeof globalThis.navigator.setAppBadge === "function"
    ? globalThis.navigator.setAppBadge(count)
    : Promise.resolve();

const clearSwAppBadge = (): Promise<unknown> =>
  "navigator" in globalThis &&
    isObject(globalThis.navigator) &&
    typeof globalThis.navigator.clearAppBadge === "function"
    ? globalThis.navigator.clearAppBadge()
    : Promise.resolve();

const parsePushEventData = (event: unknown): PushPayloadData => {
  if (!isObject(event) || !isObject(event.data)) return {};
  const jsonFn = event.data.json;
  if (typeof jsonFn !== "function") return {};
  try {
    const parsed: unknown = jsonFn.call(event.data);
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const handleInstall = () => {
  const skipWaitingFn: unknown = Reflect.get(globalThis, "skipWaiting");
  if (typeof skipWaitingFn === "function") {
    skipWaitingFn.call(globalThis);
  }
};

const handleActivate = (event: Event) => {
  const clients = getClients();
  if (hasWaitUntil(event) && clients?.claim) {
    event.waitUntil(clients.claim());
  }
};

const handlePush = (event: Event) => {
  const registration = getRegistration();
  const clients = getClients();
  if (!hasWaitUntil(event) || !registration || !clients) return;
  event.waitUntil(
    handleServiceWorkerPush({
      data: parsePushEventData(event),
      registration,
      clients,
      setAppBadge: setSwAppBadge,
      clearAppBadge: clearSwAppBadge,
    }),
  );
};

const handleNotificationClick = (event: Event) => {
  const registration = getRegistration();
  const clients = getClients();
  if (
    !hasWaitUntil(event) ||
    !registration ||
    !clients ||
    !isObject(event) ||
    !isObject(event.notification)
  ) {
    return;
  }
  const rawNotif = event.notification;
  const closeFn = rawNotif.close;
  const notification = {
    tag: typeof rawNotif.tag === "string" ? rawNotif.tag : undefined,
    data: rawNotif.data,
    close: () => {
      if (typeof closeFn === "function") closeFn.call(rawNotif);
    },
  };
  const action = typeof event.action === "string" ? event.action : "";
  const reply = typeof event.reply === "string" ? event.reply : undefined;
  event.waitUntil(
    handleServiceWorkerNotificationClick({
      action,
      reply,
      notification,
      registration,
      clients,
      setAppBadge: setSwAppBadge,
      clearAppBadge: clearSwAppBadge,
    }),
  );
};

export const installServiceWorkerListeners = () => {
  globalThis.addEventListener("install", handleInstall);
  globalThis.addEventListener("activate", handleActivate);
  globalThis.addEventListener("push", handlePush);
  globalThis.addEventListener("notificationclick", handleNotificationClick);
};

installServiceWorkerListeners();
