import {
  dismissNotificationsSigned,
  getVapidPublicKey,
  heartbeatSigned,
  registerPushSubscription,
  unregisterPushSubscription,
} from "../../backend/src/api.ts";
import type { PushSubscriptionJSON } from "../../instant.schema.ts";
import type { Credentials } from "./clientApi.ts";
import { buildSignedRequest } from "./authClient.ts";
import { defaultPushKeyStore } from "./pushKeyStore.ts";
import { syncAppBadgeFromNotifications } from "./pushNotification.ts";

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = globalThis.atob(base64);
  return Uint8Array.from(rawData, (ch) => ch.charCodeAt(0));
};

const ensureNotificationPermission = async () => {
  if (typeof globalThis.Notification === "undefined") return;
  if (globalThis.Notification.permission === "denied") {
    throw new Error(
      "Notifications are blocked — allow them in App Info → Notifications",
    );
  }
  if (globalThis.Notification.permission === "default") {
    const perm = await globalThis.Notification.requestPermission();
    if (perm !== "granted") {
      throw new Error("Notification permission was not granted");
    }
  }
};

const subscribeWithKeyRetry = async (
  reg: ServiceWorkerRegistration,
  applicationServerKey: Uint8Array<ArrayBuffer>,
) => {
  try {
    return await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });
  } catch (err) {
    const existing = await reg.pushManager.getSubscription();
    if (!existing) throw err;
    await existing.unsubscribe();
    return reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });
  }
};

const toNormalizedSubscription = (
  sub: PushSubscription,
): PushSubscriptionJSON => {
  const raw = sub.toJSON();
  const endpoint = raw.endpoint ?? sub.endpoint;
  const p256dh = raw.keys?.p256dh ?? "";
  const auth = raw.keys?.auth ?? "";
  if (!endpoint || !p256dh || !auth) {
    throw new Error("Push subscription missing encryption keys");
  }
  return {
    endpoint,
    expirationTime: raw.expirationTime ?? null,
    keys: { p256dh, auth },
  };
};

type RegisterOptions = { conversationId?: string; swPath?: string };

export const registerPush = async (
  credentials: Credentials,
  options: RegisterOptions = {},
) => {
  if (!("serviceWorker" in navigator) || !("PushManager" in globalThis)) {
    throw new Error("Push notifications are not supported in this browser");
  }
  await ensureNotificationPermission();
  const swPath = options.swPath ?? "/sw.js";
  await navigator.serviceWorker.register(swPath);
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await getVapidPublicKey();
  const sub = await subscribeWithKeyRetry(
    reg,
    urlBase64ToUint8Array(publicKey),
  );
  const normalized = toNormalizedSubscription(sub);
  await Promise.all([
    defaultPushKeyStore.setCredentials(credentials),
    defaultPushKeyStore.setPushEndpoint(normalized.endpoint),
  ]);
  const payload = {
    subscription: normalized,
    conversationId: options.conversationId,
  };
  await registerPushSubscription(
    await buildSignedRequest(credentials, "registerPushSubscription", payload),
  );
  return { supported: true } as const;
};

const setNavigatorBadge = (count: number) =>
  "setAppBadge" in navigator && typeof navigator.setAppBadge === "function"
    ? navigator.setAppBadge(count)
    : Promise.resolve();

const clearNavigatorBadge = () =>
  "clearAppBadge" in navigator && typeof navigator.clearAppBadge === "function"
    ? navigator.clearAppBadge()
    : Promise.resolve();

export const closeLocalNotificationsForConversation = async (
  conversationId?: string,
) => {
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration().catch(() => null);
  if (!reg || typeof reg.getNotifications !== "function") return;
  const matching = await reg
    .getNotifications(conversationId ? { tag: conversationId } : undefined)
    .catch(() => []);
  matching.forEach((n) => n.close());
  await syncAppBadgeFromNotifications({
    registration: {
      showNotification: (title, opts) => reg.showNotification(title, opts),
      getNotifications: (filter) => reg.getNotifications(filter),
    },
    setAppBadge: setNavigatorBadge,
    clearAppBadge: clearNavigatorBadge,
  }).catch(() => {});
};

const resolveCurrentPushEndpoint = async (): Promise<string | undefined> => {
  const stored = await defaultPushKeyStore.getPushEndpoint();
  if (stored) return stored;
  if (!("serviceWorker" in navigator)) return undefined;
  const reg = await navigator.serviceWorker.getRegistration().catch(() => null);
  const sub = await reg?.pushManager?.getSubscription().catch(() => null);
  return sub?.endpoint;
};

export const dismissConversationNotifications = async (
  credentials: Credentials,
  conversationId: string,
) => {
  await closeLocalNotificationsForConversation(conversationId);
  const excludeEndpoint = await resolveCurrentPushEndpoint();
  await dismissNotificationsSigned(credentials, {
    conversationId,
    ...(excludeEndpoint ? { excludeEndpoint } : {}),
  }).catch(() => {});
};

export const unregisterPush = async (credentials: Credentials) => {
  if (!("serviceWorker" in navigator)) {
    await defaultPushKeyStore.clear();
    return;
  }
  await closeLocalNotificationsForConversation();
  await defaultPushKeyStore.clear();
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const payload = { endpoint: sub.endpoint };
  await unregisterPushSubscription(
    await buildSignedRequest(
      credentials,
      "unregisterPushSubscription",
      payload,
    ),
  );
  await sub.unsubscribe();
};

export const reportActive = (credentials: Credentials) =>
  heartbeatSigned(credentials);
