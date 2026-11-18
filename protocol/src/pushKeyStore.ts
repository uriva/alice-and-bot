import type { Credentials } from "./clientApi.ts";

export type PushKeyStore = {
  getCredentials: () => Promise<Credentials | null>;
  setCredentials: (credentials: Credentials) => Promise<void>;
  getConversationKey: (conversationId: string) => Promise<string | null>;
  setConversationKey: (conversationId: string, key: string) => Promise<void>;
  getPushEndpoint: () => Promise<string | null>;
  setPushEndpoint: (endpoint: string) => Promise<void>;
  clear: () => Promise<void>;
};

const dbName = "alicebot_push_store";
const storeName = "kv";
const credentialsKey = "credentials";
const pushEndpointKey = "push_endpoint";
const conversationKeyPrefix = "conv_key:";

const isCredentials = (value: unknown): value is Credentials =>
  typeof value === "object" &&
  value !== null &&
  "publicSignKey" in value &&
  typeof value.publicSignKey === "string" &&
  "privateSignKey" in value &&
  typeof value.privateSignKey === "string" &&
  "privateEncryptKey" in value &&
  typeof value.privateEncryptKey === "string";

const openIndexedDb = (factory: IDBFactory): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = factory.open(dbName, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(storeName)) {
        req.result.createObjectStore(storeName);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const idbGet = (factory: IDBFactory, key: string): Promise<unknown> =>
  openIndexedDb(factory).then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const req = tx.objectStore(storeName).get(key);
        req.onsuccess = () => {
          db.close();
          resolve(req.result);
        };
        req.onerror = () => {
          db.close();
          reject(req.error);
        };
      }),
  );

const idbPut = (
  factory: IDBFactory,
  key: string,
  value: unknown,
): Promise<void> =>
  openIndexedDb(factory).then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        tx.objectStore(storeName).put(value, key);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      }),
  );

const idbClear = (factory: IDBFactory): Promise<void> =>
  openIndexedDb(factory).then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        tx.objectStore(storeName).clear();
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      }),
  );

const buildStoreFromMap = (entries: Map<string, unknown>): PushKeyStore => ({
  getCredentials: () => {
    const val = entries.get(credentialsKey);
    return Promise.resolve(isCredentials(val) ? val : null);
  },
  setCredentials: (credentials) => {
    entries.set(credentialsKey, credentials);
    return Promise.resolve();
  },
  getConversationKey: (conversationId) => {
    const val = entries.get(`${conversationKeyPrefix}${conversationId}`);
    return Promise.resolve(typeof val === "string" ? val : null);
  },
  setConversationKey: (conversationId, key) => {
    entries.set(`${conversationKeyPrefix}${conversationId}`, key);
    return Promise.resolve();
  },
  getPushEndpoint: () => {
    const val = entries.get(pushEndpointKey);
    return Promise.resolve(typeof val === "string" ? val : null);
  },
  setPushEndpoint: (endpoint) => {
    entries.set(pushEndpointKey, endpoint);
    return Promise.resolve();
  },
  clear: () => {
    entries.clear();
    return Promise.resolve();
  },
});

export const createMemoryPushKeyStore = (): PushKeyStore =>
  buildStoreFromMap(new Map<string, unknown>());

export const createIndexedDbPushKeyStore = (
  factory: IDBFactory,
): PushKeyStore => ({
  getCredentials: () =>
    idbGet(factory, credentialsKey)
      .then((val) => (isCredentials(val) ? val : null))
      .catch(() => null),
  setCredentials: (credentials) =>
    idbPut(factory, credentialsKey, credentials).catch(() => {}),
  getConversationKey: (conversationId) =>
    idbGet(factory, `${conversationKeyPrefix}${conversationId}`)
      .then((val) => (typeof val === "string" ? val : null))
      .catch(() => null),
  setConversationKey: (conversationId, key) =>
    idbPut(factory, `${conversationKeyPrefix}${conversationId}`, key).catch(
      () => {},
    ),
  getPushEndpoint: () =>
    idbGet(factory, pushEndpointKey)
      .then((val) => (typeof val === "string" ? val : null))
      .catch(() => null),
  setPushEndpoint: (endpoint) =>
    idbPut(factory, pushEndpointKey, endpoint).catch(() => {}),
  clear: () => idbClear(factory).catch(() => {}),
});

const fallbackMemoryStore = createMemoryPushKeyStore();

const resolveActiveStore = (): PushKeyStore =>
  typeof globalThis.indexedDB !== "undefined"
    ? createIndexedDbPushKeyStore(globalThis.indexedDB)
    : fallbackMemoryStore;

export const defaultPushKeyStore: PushKeyStore = {
  getCredentials: () => resolveActiveStore().getCredentials(),
  setCredentials: (c) => resolveActiveStore().setCredentials(c),
  getConversationKey: (id) => resolveActiveStore().getConversationKey(id),
  setConversationKey: (id, key) =>
    resolveActiveStore().setConversationKey(id, key),
  getPushEndpoint: () => resolveActiveStore().getPushEndpoint(),
  setPushEndpoint: (endpoint) => resolveActiveStore().setPushEndpoint(endpoint),
  clear: () => resolveActiveStore().clear(),
};

export const savePushCredentials = (credentials: Credentials) =>
  defaultPushKeyStore.setCredentials(credentials);

export const savePushConversationKey = (conversationId: string, key: string) =>
  defaultPushKeyStore.setConversationKey(conversationId, key);

export const clearPushKeyStore = () => defaultPushKeyStore.clear();
