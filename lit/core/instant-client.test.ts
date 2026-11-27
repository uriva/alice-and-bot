import { assertEquals } from "@std/assert";
import type { Credentials } from "../../protocol/src/clientApi.ts";
import {
  type AuthStateSnapshot,
  makeSubscribeAuthedQuery,
} from "./instant-client.ts";

const sampleCreds: Credentials = {
  publicSignKey: "pub-key-a",
  privateSignKey: "priv-sign-a",
  privateEncryptKey: "priv-enc-a",
};

const flushMicrotasks = async (rounds = 6) => {
  await Promise.resolve();
  if (rounds > 1) await flushMicrotasks(rounds - 1);
};

const makeAuthHub = (initial: AuthStateSnapshot) => {
  const listeners = new Set<(snapshot: AuthStateSnapshot) => void>();
  const current = { snapshot: initial };
  return {
    subscribeAuth: (cb: (snapshot: AuthStateSnapshot) => void) => {
      listeners.add(cb);
      if (!current.snapshot.isLoading) cb(current.snapshot);
      return () => {
        listeners.delete(cb);
      };
    },
    emit: (snapshot: AuthStateSnapshot) => {
      current.snapshot = snapshot;
      listeners.forEach((cb) => cb(snapshot));
    },
  };
};

Deno.test("subscribeAuthedQuery does not run unauthenticated query when auth fails, retries, and attaches once signed in", async () => {
  const expectedEmail = "user-a@identity.aliceandbot.internal";
  const authHub = makeAuthHub({ isLoading: false, user: null });
  const state = { authAttempts: 0, queryAttachCount: 0 };
  const received: Array<{ conversations: string[] }> = [];

  const subscribe = makeSubscribeAuthedQuery<
    { q: string },
    { conversations: string[] }
  >({
    isBrowserAuthCapable: () => true,
    canSign: () => Promise.resolve(true),
    expectedEmailFor: () => Promise.resolve(expectedEmail),
    subscribeAuth: authHub.subscribeAuth,
    ensureAuth: () => {
      state.authAttempts += 1;
      if (state.authAttempts < 3) return Promise.resolve(false);
      authHub.emit({ isLoading: false, user: { email: expectedEmail } });
      return Promise.resolve(true);
    },
    subscribeQuery: (_q, cb) => {
      state.queryAttachCount += 1;
      cb({ conversations: ["conv-1", "conv-2"] });
      return () => {};
    },
    retryDelayMs: () => 5,
  });

  const unsub = subscribe(sampleCreds, { q: "conversations" }, (resp) => {
    received.push(resp);
  });

  await flushMicrotasks();
  assertEquals(state.authAttempts, 1);
  assertEquals(
    state.queryAttachCount,
    0,
    "must not attach unauthenticated query after auth failure",
  );
  assertEquals(received, []);

  await new Promise((r) => setTimeout(r, 40));
  assertEquals(state.authAttempts, 3);
  assertEquals(state.queryAttachCount, 1);
  assertEquals(received, [{ conversations: ["conv-1", "conv-2"] }]);
  unsub();
});

Deno.test("subscribeAuthedQuery recovers automatically when stale cached auth drops to null without delivering empty unauthenticated results", async () => {
  const expectedEmail = "user-a@identity.aliceandbot.internal";
  const authHub = makeAuthHub({
    isLoading: false,
    user: { email: expectedEmail },
  });
  const state = {
    authAttempts: 0,
    queryAttachCount: 0,
    queryDetachCount: 0,
    activeCb: null as ((resp: { conversations: string[] }) => void) | null,
  };
  const received: Array<{ conversations: string[] }> = [];

  const subscribe = makeSubscribeAuthedQuery<
    { q: string },
    { conversations: string[] }
  >({
    isBrowserAuthCapable: () => true,
    canSign: () => Promise.resolve(true),
    expectedEmailFor: () => Promise.resolve(expectedEmail),
    subscribeAuth: authHub.subscribeAuth,
    ensureAuth: () => {
      state.authAttempts += 1;
      return new Promise((resolve) => {
        setTimeout(() => {
          authHub.emit({ isLoading: false, user: { email: expectedEmail } });
          resolve(true);
        }, 10);
      });
    },
    subscribeQuery: (_q, cb) => {
      state.queryAttachCount += 1;
      state.activeCb = cb;
      if (state.queryAttachCount === 2) {
        cb({ conversations: ["recovered-conv"] });
      }
      return () => {
        state.queryDetachCount += 1;
        state.activeCb = null;
      };
    },
    retryDelayMs: () => 5,
  });

  const unsub = subscribe(sampleCreds, { q: "conversations" }, (resp) => {
    received.push(resp);
  });

  await flushMicrotasks();
  assertEquals(state.queryAttachCount, 1);
  assertEquals(state.authAttempts, 0);

  // InstantDB WS init rejects stale refresh token and clears user to null.
  const staleCb = state.activeCb;
  authHub.emit({ isLoading: false, user: null });
  // Even if an unauthenticated empty response tries to slip through on the old listener, it must be ignored.
  staleCb?.({ conversations: [] });

  assertEquals(state.queryDetachCount, 1);
  assertEquals(received, []);

  await new Promise((r) => setTimeout(r, 30));
  assertEquals(state.authAttempts, 1);
  assertEquals(state.queryAttachCount, 2);
  assertEquals(received, [{ conversations: ["recovered-conv"] }]);
  unsub();
});

Deno.test("subscribeAuthedQuery re-authenticates when signed in as a different identity before attaching query", async () => {
  const expectedEmail = "user-b@identity.aliceandbot.internal";
  const authHub = makeAuthHub({
    isLoading: false,
    user: { email: "user-a@identity.aliceandbot.internal" },
  });
  const state = { authAttempts: 0, queryAttachCount: 0 };
  const received: Array<{ conversations: string[] }> = [];

  const subscribe = makeSubscribeAuthedQuery<
    { q: string },
    { conversations: string[] }
  >({
    isBrowserAuthCapable: () => true,
    canSign: () => Promise.resolve(true),
    expectedEmailFor: () => Promise.resolve(expectedEmail),
    subscribeAuth: authHub.subscribeAuth,
    ensureAuth: () => {
      state.authAttempts += 1;
      authHub.emit({ isLoading: false, user: { email: expectedEmail } });
      return Promise.resolve(true);
    },
    subscribeQuery: (_q, cb) => {
      state.queryAttachCount += 1;
      cb({ conversations: ["b-conv-1"] });
      return () => {};
    },
    retryDelayMs: () => 5,
  });

  const unsub = subscribe(sampleCreds, { q: "conversations" }, (resp) => {
    received.push(resp);
  });

  await flushMicrotasks();
  assertEquals(state.authAttempts, 1);
  assertEquals(state.queryAttachCount, 1);
  assertEquals(received, [{ conversations: ["b-conv-1"] }]);
  unsub();
});

Deno.test("subscribeAuthedQuery stops retrying cleanly when unsubscribed during backoff", async () => {
  const expectedEmail = "user-a@identity.aliceandbot.internal";
  const authHub = makeAuthHub({ isLoading: false, user: null });
  const state = { authAttempts: 0, queryAttachCount: 0 };

  const subscribe = makeSubscribeAuthedQuery<
    { q: string },
    { conversations: string[] }
  >({
    isBrowserAuthCapable: () => true,
    canSign: () => Promise.resolve(true),
    expectedEmailFor: () => Promise.resolve(expectedEmail),
    subscribeAuth: authHub.subscribeAuth,
    ensureAuth: () => {
      state.authAttempts += 1;
      return Promise.resolve(false);
    },
    subscribeQuery: () => {
      state.queryAttachCount += 1;
      return () => {};
    },
    retryDelayMs: () => 10,
  });

  const unsub = subscribe(sampleCreds, { q: "conversations" }, () => {});
  await flushMicrotasks();
  assertEquals(state.authAttempts, 1);
  unsub();

  await new Promise((r) => setTimeout(r, 35));
  assertEquals(state.authAttempts, 1);
  assertEquals(state.queryAttachCount, 0);
});

Deno.test("subscribeAuthedQuery stops immediately on permanent-failure (e.g. not-found) without retrying", async () => {
  const expectedEmail = "user-missing@identity.aliceandbot.internal";
  const authHub = makeAuthHub({ isLoading: false, user: null });
  const state = { authAttempts: 0, queryAttachCount: 0 };

  const subscribe = makeSubscribeAuthedQuery<
    { q: string },
    { conversations: string[] }
  >({
    isBrowserAuthCapable: () => true,
    canSign: () => Promise.resolve(true),
    expectedEmailFor: () => Promise.resolve(expectedEmail),
    subscribeAuth: authHub.subscribeAuth,
    ensureAuth: () => {
      state.authAttempts += 1;
      return Promise.resolve("permanent-failure");
    },
    subscribeQuery: () => {
      state.queryAttachCount += 1;
      return () => {};
    },
    retryDelayMs: () => 5,
    maxAuthRetries: 5,
  });

  const unsub = subscribe(sampleCreds, { q: "conversations" }, () => {});
  await new Promise((r) => setTimeout(r, 40));
  assertEquals(state.authAttempts, 1);
  assertEquals(state.queryAttachCount, 0);
  unsub();
});

Deno.test("subscribeAuthedQuery caps consecutive auth retries at maxAuthRetries", async () => {
  const expectedEmail = "user-flaky@identity.aliceandbot.internal";
  const authHub = makeAuthHub({ isLoading: false, user: null });
  const state = { authAttempts: 0, queryAttachCount: 0 };

  const subscribe = makeSubscribeAuthedQuery<
    { q: string },
    { conversations: string[] }
  >({
    isBrowserAuthCapable: () => true,
    canSign: () => Promise.resolve(true),
    expectedEmailFor: () => Promise.resolve(expectedEmail),
    subscribeAuth: authHub.subscribeAuth,
    ensureAuth: () => {
      state.authAttempts += 1;
      return Promise.resolve("retry");
    },
    subscribeQuery: () => {
      state.queryAttachCount += 1;
      return () => {};
    },
    retryDelayMs: () => 5,
    maxAuthRetries: 3,
  });

  const unsub = subscribe(sampleCreds, { q: "conversations" }, () => {});
  await new Promise((r) => setTimeout(r, 80));
  assertEquals(state.authAttempts, 3);
  assertEquals(state.queryAttachCount, 0);
  unsub();
});
