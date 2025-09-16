import {
  getVapidPublicKey,
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
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

type RegisterOptions = { conversationId?: string; swPath?: string };

export const registerPush = async (
  credentials: Credentials,
  options: RegisterOptions = {},
) => {
  if (!("serviceWorker" in navigator) || !("PushManager" in globalThis)) {
    return { supported: false } as const;
  }
  const swPath = options.swPath ?? "/sw.js";
  const reg = await navigator.serviceWorker.register(swPath);
  const { publicKey } = await getVapidPublicKey();
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  const payload = {
    subscription: sub.toJSON() as PushSubscriptionJSON,
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
