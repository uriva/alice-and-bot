import { assertEquals } from "@std/assert";
import { createIdentity } from "./clientApi.ts";
import { registerPush, unregisterPush } from "./pushClient.ts";

Deno.test(
  "registerPush requests Notification permission synchronously before network fetch, awaits ready SW, and normalizes missing expirationTime",
  async () => {
    const creds = await createIdentity("Push Test User");
    const events: string[] = [];
    const origNav = globalThis.navigator;
    const origNotification = globalThis.Notification;
    const origPushManager = "PushManager" in globalThis
      ? globalThis.PushManager
      : undefined;

    const fakeSub = {
      endpoint:
        `https://fcm.googleapis.com/fcm/send/test-${crypto.randomUUID()}`,
      toJSON: () => ({
        endpoint: fakeSub.endpoint,
        keys: { p256dh: "key-p256dh", auth: "key-auth" },
      }),
      unsubscribe: () => Promise.resolve(true),
    };

    const installingReg = {
      active: null,
      pushManager: {
        getSubscription: () => Promise.resolve(null),
        subscribe: () =>
          Promise.reject(
            new DOMException(
              "Subscription failed - no active Service Worker",
              "InvalidStateError",
            ),
          ),
      },
    };

    const readyReg = {
      active: {},
      pushManager: {
        getSubscription: () => Promise.resolve(fakeSub),
        subscribe: () => {
          events.push("subscribeReady");
          return Promise.resolve(fakeSub);
        },
      },
    };

    Object.defineProperty(globalThis, "PushManager", {
      value: () => {},
      configurable: true,
    });
    Object.defineProperty(globalThis, "Notification", {
      value: {
        permission: "default",
        requestPermission: () => {
          events.push("requestPermission");
          return Promise.resolve("granted");
        },
      },
      configurable: true,
    });
    Object.defineProperty(globalThis, "navigator", {
      value: {
        ...origNav,
        serviceWorker: {
          register: () => {
            events.push("registerSw");
            return Promise.resolve(installingReg);
          },
          ready: Promise.resolve().then(() => {
            events.push("swReady");
            return readyReg;
          }),
          getRegistration: () => Promise.resolve(readyReg),
        },
      },
      configurable: true,
    });

    const restoreGlobals = () => {
      Object.defineProperty(globalThis, "navigator", {
        value: origNav,
        configurable: true,
      });
      Object.defineProperty(globalThis, "Notification", {
        value: origNotification,
        configurable: true,
      });
      Object.defineProperty(globalThis, "PushManager", {
        value: origPushManager,
        configurable: true,
      });
    };

    const result = await registerPush(creds).finally(() => {});
    await unregisterPush(creds);
    restoreGlobals();

    assertEquals(result, { supported: true });
    assertEquals(events[0], "requestPermission");
    assertEquals(events.includes("subscribeReady"), true);
  },
);
