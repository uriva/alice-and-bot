import {
  getVapidPublicKey,
  heartbeatSigned,
  registerPushSubscription,
  unregisterPushSubscription,
} from "../../backend/src/api.ts";
import type { PushSubscriptionJSON } from "../../instant.schema.ts";
import type { Credentials } from "./clientApi.ts";
import { buildSignedRequest } from "./authClient.ts";

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
  const payload = {
    subscription: toNormalizedSubscription(sub),
    conversationId: options.conversationId,
  };
  await registerPushSubscription(
    await buildSignedRequest(credentials, "registerPushSubscription", payload),
  );
  return { supported: true } as const;
};

export const unregisterPush = async (credentials: Credentials) => {
  if (!("serviceWorker" in navigator)) return;
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
