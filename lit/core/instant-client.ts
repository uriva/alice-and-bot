import {
  type InfiniteQueryCallbackResponse,
  type InfiniteQuerySubscription,
  init,
  type InstaQLSubscriptionState,
  type ValidQuery,
} from "@instantdb/core";
import { init as adminInit } from "@instantdb/admin";
import { mintInstantTokenSigned } from "../../backend/src/api.ts";
import schema from "../../instant.schema.ts";
import type { Credentials } from "../../protocol/src/clientApi.ts";
import { instantAppId } from "../../protocol/src/clientApi.ts";
import { canSignWithPrivateKey } from "../../protocol/src/crypto.ts";
import {
  instantEmailFromPublicSignKey,
  lookupRegisteredCredentials,
  registerCredentials,
} from "../../protocol/src/instantAuth.ts";

type CoreDb = ReturnType<typeof init<typeof schema>>;
type AdminDb = ReturnType<typeof adminInit<typeof schema>>;

const dbRefs: { core: CoreDb | null; admin: AdminDb | null } = {
  core: null,
  admin: null,
};

export const accessDb = (): CoreDb => {
  if (!dbRefs.core) {
    dbRefs.core = init({ appId: instantAppId, schema, devtool: false });
  }
  return dbRefs.core;
};

export const accessAdminDb = (): AdminDb => {
  if (!dbRefs.admin) {
    dbRefs.admin = adminInit({ appId: instantAppId, schema }).asUser({
      guest: true,
    });
  }
  return dbRefs.admin;
};

const isBrowserAuthCapable = (): boolean =>
  typeof globalThis.window !== "undefined" && typeof indexedDB !== "undefined";

const inFlightAuth = new Map<string, Promise<void>>();

const authenticateIdentity = async (
  credentials: Credentials,
): Promise<void> => {
  if (!(await canSignWithPrivateKey(credentials.privateSignKey))) return;
  const expectedEmail = await instantEmailFromPublicSignKey(
    credentials.publicSignKey,
  );
  const current = await accessDb().getAuth().catch(() => null);
  if (current?.email === expectedEmail) return;
  const res = await mintInstantTokenSigned(credentials);
  if ("token" in res) {
    await accessDb().auth.signInWithToken(res.token);
  }
};

export const ensureInstantAuth = (
  credentials: Credentials | undefined,
): Promise<void> => {
  if (!credentials) return Promise.resolve();
  registerCredentials(credentials);
  if (!isBrowserAuthCapable()) return Promise.resolve();
  const existing = inFlightAuth.get(credentials.publicSignKey);
  if (existing) return existing;
  const promise = authenticateIdentity(credentials)
    .catch((err) => {
      console.warn("Failed to sign in to InstantDB", err);
    })
    .finally(() => {
      inFlightAuth.delete(credentials.publicSignKey);
    });
  inFlightAuth.set(credentials.publicSignKey, promise);
  return promise;
};

const resolveCredentials = (
  credentialsOrKey: Credentials | string | undefined,
): Credentials | undefined =>
  typeof credentialsOrKey === "string"
    ? lookupRegisteredCredentials(credentialsOrKey)
    : credentialsOrKey;

export const subscribeAuthedQuery = <
  Q extends ValidQuery<Q, typeof schema>,
>(
  credentialsOrKey: Credentials | string | undefined,
  query: Q,
  cb: (resp: InstaQLSubscriptionState<typeof schema, Q, false>) => void,
): () => void => {
  const creds = resolveCredentials(credentialsOrKey);
  if (!creds || !isBrowserAuthCapable()) {
    return accessDb().subscribeQuery(query, cb);
  }
  const state: { cancelled: boolean; innerUnsub: (() => void) | undefined } = {
    cancelled: false,
    innerUnsub: undefined,
  };
  ensureInstantAuth(creds).then(() => {
    if (state.cancelled) return;
    state.innerUnsub = accessDb().subscribeQuery(query, cb);
  });
  return () => {
    state.cancelled = true;
    state.innerUnsub?.();
  };
};

export const subscribeAuthedInfiniteQuery = <
  Q extends ValidQuery<Q, typeof schema>,
>(
  credentialsOrKey: Credentials | string | undefined,
  query: Q,
  cb: (resp: InfiniteQueryCallbackResponse<typeof schema, Q, false>) => void,
): InfiniteQuerySubscription => {
  const creds = resolveCredentials(credentialsOrKey);
  if (!creds || !isBrowserAuthCapable()) {
    return accessDb().subscribeInfiniteQuery(query, cb);
  }
  const state: {
    cancelled: boolean;
    innerSub: InfiniteQuerySubscription | undefined;
    pendingLoadNext: boolean;
  } = {
    cancelled: false,
    innerSub: undefined,
    pendingLoadNext: false,
  };
  ensureInstantAuth(creds).then(() => {
    if (state.cancelled) return;
    state.innerSub = accessDb().subscribeInfiniteQuery(query, cb);
    if (state.pendingLoadNext) {
      state.innerSub.loadNextPage();
    }
  });
  return {
    unsubscribe: () => {
      state.cancelled = true;
      state.innerSub?.unsubscribe();
    },
    loadNextPage: () => {
      if (state.innerSub) state.innerSub.loadNextPage();
      else state.pendingLoadNext = true;
    },
  };
};
