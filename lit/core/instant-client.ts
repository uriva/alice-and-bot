import {
  type InfiniteQueryCallbackResponse,
  type InfiniteQuerySubscription,
  init,
  type InstaQLSubscriptionState,
  type ValidQuery,
} from "@instantdb/core";
import { init as adminInit } from "@instantdb/admin";
import {
  type MintInstantTokenBootstrap,
  mintInstantTokenSigned,
} from "../../backend/src/api.ts";
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

export const isBrowserAuthCapable = (): boolean =>
  typeof globalThis.window !== "undefined" && typeof indexedDB !== "undefined";

const inFlightAuth = new Map<string, Promise<boolean>>();

type ColdBootstrapHint = {
  includeConversations?: boolean;
  conversationId?: string;
};

const coldBootstrapHints = new Map<string, ColdBootstrapHint>();
const inFlightBootstrapConv = new Map<string, string>();
const activeColdBootstraps = new Map<string, MintInstantTokenBootstrap>();
const coldBootstrapListeners = new Map<
  string,
  Set<(bootstrap: MintInstantTokenBootstrap) => void>
>();

export const hintColdBootstrap = (
  publicSignKey: string,
  hint: ColdBootstrapHint,
): void => {
  if (!publicSignKey) return;
  const prev = coldBootstrapHints.get(publicSignKey) ?? {};
  coldBootstrapHints.set(publicSignKey, {
    includeConversations: prev.includeConversations ||
      hint.includeConversations,
    conversationId: hint.conversationId ?? prev.conversationId,
  });
};

export const subscribeColdBootstrap = (
  publicSignKey: string,
  listener: (bootstrap: MintInstantTokenBootstrap) => void,
): () => void => {
  if (!publicSignKey) return () => {};
  const existing = activeColdBootstraps.get(publicSignKey);
  if (existing) listener(existing);
  const set = coldBootstrapListeners.get(publicSignKey) ?? new Set();
  set.add(listener);
  coldBootstrapListeners.set(publicSignKey, set);
  return () => {
    const currentSet = coldBootstrapListeners.get(publicSignKey);
    if (!currentSet) return;
    currentSet.delete(listener);
    if (currentSet.size === 0) coldBootstrapListeners.delete(publicSignKey);
  };
};

export const isInstantAuthInFlight = (publicSignKey: string): boolean =>
  inFlightAuth.has(publicSignKey);

export const isConversationBootstrapping = (
  publicSignKey: string,
  conversationId: string,
): boolean =>
  coldBootstrapHints.get(publicSignKey)?.conversationId === conversationId ||
  inFlightBootstrapConv.get(publicSignKey) === conversationId ||
  activeColdBootstraps.get(publicSignKey)?.conversationBootstrap
      ?.conversationId === conversationId;

const authenticateIdentity = async (
  credentials: Credentials,
): Promise<boolean> => {
  await Promise.resolve();
  if (!(await canSignWithPrivateKey(credentials.privateSignKey))) return true;
  const expectedEmail = await instantEmailFromPublicSignKey(
    credentials.publicSignKey,
  );
  const current = await accessDb().getAuth().catch(() => null);
  if (current?.email === expectedEmail) {
    coldBootstrapHints.delete(credentials.publicSignKey);
    return true;
  }
  const hints = coldBootstrapHints.get(credentials.publicSignKey);
  coldBootstrapHints.delete(credentials.publicSignKey);
  if (hints?.conversationId) {
    inFlightBootstrapConv.set(credentials.publicSignKey, hints.conversationId);
  }
  const res = await mintInstantTokenSigned(credentials, hints);
  if ("token" in res) {
    const bootstrap: MintInstantTokenBootstrap = {
      ...(res.conversations !== undefined
        ? { conversations: res.conversations }
        : {}),
      ...(res.conversationBootstrap !== undefined
        ? { conversationBootstrap: res.conversationBootstrap }
        : {}),
    };
    if (
      bootstrap.conversations !== undefined ||
      bootstrap.conversationBootstrap !== undefined
    ) {
      activeColdBootstraps.set(credentials.publicSignKey, bootstrap);
      coldBootstrapListeners
        .get(credentials.publicSignKey)
        ?.forEach((fn) => fn(bootstrap));
    }
    await accessDb().auth.signInWithToken(res.token);
    return true;
  }
  return false;
};

const ensureInstantAuthOutcome = (
  credentials: Credentials | undefined,
): Promise<boolean> => {
  if (!credentials) return Promise.resolve(true);
  registerCredentials(credentials);
  if (!isBrowserAuthCapable()) return Promise.resolve(true);
  const existing = inFlightAuth.get(credentials.publicSignKey);
  if (existing) return existing;
  const promise = authenticateIdentity(credentials)
    .catch((err) => {
      console.warn("Failed to sign in to InstantDB", err);
      return false;
    })
    .finally(() => {
      inFlightAuth.delete(credentials.publicSignKey);
      inFlightBootstrapConv.delete(credentials.publicSignKey);
      activeColdBootstraps.delete(credentials.publicSignKey);
    });
  inFlightAuth.set(credentials.publicSignKey, promise);
  return promise;
};

export const ensureInstantAuth = (
  credentials: Credentials | undefined,
): Promise<void> => ensureInstantAuthOutcome(credentials).then(() => {});

const resolveCredentials = (
  credentialsOrKey: Credentials | string | undefined,
): Credentials | undefined =>
  typeof credentialsOrKey === "string"
    ? lookupRegisteredCredentials(credentialsOrKey)
    : credentialsOrKey;

export type AuthStateSnapshot = {
  isLoading?: boolean;
  user?: { email?: string | null } | null;
};

const defaultAuthRetryDelayMs = (attempt: number) =>
  Math.min(15_000, 500 * 2 ** Math.max(0, attempt - 1));

export const makeSubscribeAuthedQuery = <Q, Resp>(deps: {
  isBrowserAuthCapable: () => boolean;
  canSign: (privateSignKey: string) => Promise<boolean>;
  expectedEmailFor: (publicSignKey: string) => Promise<string>;
  subscribeAuth: (cb: (auth: AuthStateSnapshot) => void) => () => void;
  ensureAuth: (creds: Credentials) => Promise<boolean>;
  subscribeQuery: (query: Q, cb: (resp: Resp) => void) => () => void;
  retryDelayMs?: (attempt: number) => number;
}) =>
(
  credentialsOrKey: Credentials | string | undefined,
  query: Q,
  cb: (resp: Resp) => void,
): () => void => {
  const creds = resolveCredentials(credentialsOrKey);
  if (!creds || !deps.isBrowserAuthCapable()) {
    return deps.subscribeQuery(query, cb);
  }
  const delayFor = deps.retryDelayMs ?? defaultAuthRetryDelayMs;
  const state: {
    cancelled: boolean;
    expectedEmail: string | null;
    currentEmail: string | null;
    authKnown: boolean;
    authInFlight: boolean;
    retryAttempt: number;
    innerUnsub: (() => void) | undefined;
    authUnsub: (() => void) | undefined;
    retryTimer: ReturnType<typeof setTimeout> | undefined;
  } = {
    cancelled: false,
    expectedEmail: null,
    currentEmail: null,
    authKnown: false,
    authInFlight: false,
    retryAttempt: 0,
    innerUnsub: undefined,
    authUnsub: undefined,
    retryTimer: undefined,
  };

  const clearRetry = () => {
    if (state.retryTimer === undefined) return;
    clearTimeout(state.retryTimer);
    state.retryTimer = undefined;
  };

  const detachQuery = () => {
    state.innerUnsub?.();
    state.innerUnsub = undefined;
  };

  const isAuthedForExpected = () =>
    Boolean(state.expectedEmail && state.currentEmail === state.expectedEmail);

  const attachQueryIfReady = () => {
    if (state.cancelled || !isAuthedForExpected() || state.innerUnsub) return;
    state.innerUnsub = deps.subscribeQuery(query, (resp) => {
      if (state.cancelled || !isAuthedForExpected()) return;
      cb(resp);
    });
  };

  const triggerAuth = () => {
    if (state.cancelled || state.authInFlight || isAuthedForExpected()) return;
    clearRetry();
    state.authInFlight = true;
    deps.ensureAuth(creds).then((ok) => {
      state.authInFlight = false;
      if (state.cancelled) return;
      if (ok && isAuthedForExpected()) {
        state.retryAttempt = 0;
        attachQueryIfReady();
        return;
      }
      if (ok && !state.authKnown) return;
      state.retryAttempt += 1;
      state.retryTimer = setTimeout(() => {
        state.retryTimer = undefined;
        triggerAuth();
      }, delayFor(state.retryAttempt));
    });
  };

  const handleAuth = (auth: AuthStateSnapshot) => {
    if (state.cancelled || auth.isLoading) return;
    state.authKnown = true;
    state.currentEmail = auth.user?.email ?? null;
    if (isAuthedForExpected()) {
      state.retryAttempt = 0;
      clearRetry();
      attachQueryIfReady();
      return;
    }
    detachQuery();
    triggerAuth();
  };

  Promise.all([
    deps.canSign(creds.privateSignKey),
    deps.expectedEmailFor(creds.publicSignKey),
  ]).then(([signable, expectedEmail]) => {
    if (state.cancelled) return;
    if (!signable) {
      state.innerUnsub = deps.subscribeQuery(query, cb);
      return;
    }
    state.expectedEmail = expectedEmail;
    state.authUnsub = deps.subscribeAuth(handleAuth);
    if (!isAuthedForExpected()) triggerAuth();
  });

  return () => {
    state.cancelled = true;
    clearRetry();
    detachQuery();
    state.authUnsub?.();
    state.authUnsub = undefined;
  };
};

export const subscribeAuthedQuery = <
  Q extends ValidQuery<Q, typeof schema>,
>(
  credentialsOrKey: Credentials | string | undefined,
  query: Q,
  cb: (resp: InstaQLSubscriptionState<typeof schema, Q, false>) => void,
): () => void =>
  makeSubscribeAuthedQuery<
    Q,
    InstaQLSubscriptionState<typeof schema, Q, false>
  >({
    isBrowserAuthCapable,
    canSign: canSignWithPrivateKey,
    expectedEmailFor: instantEmailFromPublicSignKey,
    subscribeAuth: (authCb) => accessDb().subscribeAuth(authCb),
    ensureAuth: ensureInstantAuthOutcome,
    subscribeQuery: (q, queryCb) => accessDb().subscribeQuery(q, queryCb),
  })(credentialsOrKey, query, cb);

const readBaseLimit = (
  query: Record<string, unknown>,
  entity: string,
): number => {
  const entry = query[entity];
  if (!entry || typeof entry !== "object") return 100;
  const dollar = Reflect.get(entry, "$");
  if (!dollar || typeof dollar !== "object") return 100;
  const limit = Reflect.get(dollar, "limit");
  return typeof limit === "number" && limit > 0 ? limit : 100;
};

const withPageLimit = <Q extends Record<string, unknown>>(
  query: Q,
  entity: string,
  limit: number,
): Q => {
  const entry = query[entity];
  const entryObj = entry && typeof entry === "object" ? entry : {};
  const dollar = Reflect.get(entryObj, "$");
  const dollarObj = dollar && typeof dollar === "object" ? dollar : {};
  return Object.assign({}, query, {
    [entity]: Object.assign({}, entryObj, {
      $: Object.assign({}, dollarObj, { limit }),
    }),
  });
};

const extractHasNextPage = (
  pageInfo: unknown,
  data: unknown,
  entity: string,
  limit: number,
): boolean => {
  if (pageInfo && typeof pageInfo === "object") {
    const info = Reflect.get(pageInfo, entity);
    if (info && typeof info === "object") {
      const hasNext = Reflect.get(info, "hasNextPage");
      if (typeof hasNext === "boolean") return hasNext;
    }
  }
  if (data && typeof data === "object") {
    const rows = Reflect.get(data, entity);
    if (Array.isArray(rows)) return rows.length >= limit;
  }
  return false;
};

export const subscribePaginatedQuery =
  <Q extends Record<string, unknown>>(query: Q) =>
  <Data>(
    subscribeQueryFn: (
      q: Q,
      cb: (resp: {
        error?: { message: string };
        data?: Data;
        pageInfo?: unknown;
      }) => void,
    ) => () => void,
    cb: (resp: {
      error?: { message: string };
      data?: Data;
      canLoadNextPage: boolean;
    }) => void,
  ): InfiniteQuerySubscription => {
    const entity = Object.keys(query)[0] ?? "";
    const pageSize = readBaseLimit(query, entity);
    const state: {
      cancelled: boolean;
      limit: number;
      canLoadMore: boolean;
      loadingNext: boolean;
      activeUnsub: (() => void) | undefined;
      pendingUnsub: (() => void) | undefined;
    } = {
      cancelled: false,
      limit: pageSize,
      canLoadMore: false,
      loadingNext: false,
      activeUnsub: undefined,
      pendingUnsub: undefined,
    };

    const attachWindow = (targetLimit: number, isExpansion: boolean) => {
      const unsub = subscribeQueryFn(
        withPageLimit(query, entity, targetLimit),
        (resp) => {
          if (state.cancelled) return;
          if (isExpansion && state.pendingUnsub === unsub) {
            state.activeUnsub?.();
            state.activeUnsub = unsub;
            state.pendingUnsub = undefined;
            state.loadingNext = false;
          }
          if (resp.error) {
            cb({ error: resp.error, data: undefined, canLoadNextPage: false });
            return;
          }
          if (!resp.data) return;
          const canLoadNextPage = extractHasNextPage(
            resp.pageInfo,
            resp.data,
            entity,
            targetLimit,
          );
          state.canLoadMore = canLoadNextPage;
          cb({
            error: undefined,
            data: resp.data,
            canLoadNextPage,
          });
        },
      );
      if (isExpansion) state.pendingUnsub = unsub;
      else state.activeUnsub = unsub;
    };

    attachWindow(state.limit, false);

    return {
      unsubscribe: () => {
        state.cancelled = true;
        state.pendingUnsub?.();
        state.activeUnsub?.();
        state.pendingUnsub = undefined;
        state.activeUnsub = undefined;
      },
      loadNextPage: () => {
        if (state.cancelled || state.loadingNext || !state.canLoadMore) return;
        state.loadingNext = true;
        state.limit += pageSize;
        attachWindow(state.limit, true);
      },
    };
  };

export const subscribeAuthedInfiniteQuery = <
  Q extends ValidQuery<Q, typeof schema>,
>(
  credentialsOrKey: Credentials | string | undefined,
  query: Q,
  cb: (resp: InfiniteQueryCallbackResponse<typeof schema, Q, false>) => void,
): InfiniteQuerySubscription =>
  subscribePaginatedQuery(query)<
    InstaQLSubscriptionState<typeof schema, Q, false>["data"]
  >(
    (q, innerCb) =>
      subscribeAuthedQuery(credentialsOrKey, q, (resp) => {
        if (resp.error) innerCb({ error: resp.error });
        else innerCb({ data: resp.data, pageInfo: resp.pageInfo });
      }),
    (resp) => {
      if (resp.error) {
        cb({ error: resp.error, data: undefined, canLoadNextPage: false });
      } else if (resp.data) {
        cb({
          error: undefined,
          data: resp.data,
          canLoadNextPage: resp.canLoadNextPage,
        });
      }
    },
  );
