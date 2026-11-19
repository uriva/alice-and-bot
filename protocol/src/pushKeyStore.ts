import type { Credentials } from "./clientApi.ts";

export type StoredPushMessage = {
  id: string;
  payload: string;
  timestamp: number;
};

export type PushKeyStore = {
  getCredentials: () => Promise<Credentials | null>;
  setCredentials: (credentials: Credentials) => Promise<void>;
  getConversationKey: (conversationId: string) => Promise<string | null>;
  setConversationKey: (conversationId: string, key: string) => Promise<void>;
  getConversationMessages: (
    conversationId: string,
  ) => Promise<StoredPushMessage[]>;
  appendConversationMessage: (
    conversationId: string,
    message: StoredPushMessage,
  ) => Promise<void>;
  getPushEndpoint: () => Promise<string | null>;
  setPushEndpoint: (endpoint: string) => Promise<void>;
  clear: () => Promise<void>;
};

const dbName = "alicebot_push_store";
const storeName = "kv";
const credentialsKey = "credentials";
const pushEndpointKey = "push_endpoint";
const conversationKeyPrefix = "conv_key:";
const conversationMessagesPrefix = "conv_msgs:";
const maxStoredPushMessages = 20;

const isCredentials = (value: unknown): value is Credentials =>
  typeof value === "object" &&
  value !== null &&
  "publicSignKey" in value &&
  typeof value.publicSignKey === "string" &&
  "privateSignKey" in value &&
  typeof value.privateSignKey === "string" &&
  "privateEncryptKey" in value &&
  typeof value.privateEncryptKey === "string";

export const isStoredPushMessage = (
  value: unknown,
): value is StoredPushMessage =>
  typeof value === "object" &&
  value !== null &&
  "id" in value &&
  typeof value.id === "string" &&
  value.id.length > 0 &&
  "payload" in value &&
  typeof value.payload === "string" &&
  value.payload.length > 0 &&
  "timestamp" in value &&
  typeof value.timestamp === "number" &&
  Number.isFinite(value.timestamp);

const parseStoredPushMessages = (value: unknown): StoredPushMessage[] =>
  Array.isArray(value) ? value.filter(isStoredPushMessage) : [];

const mergeStoredPushMessage = (
  existing: StoredPushMessage[],
  incoming: StoredPushMessage,
): StoredPushMessage[] =>
  [incoming, ...existing.filter((m) => m.id !== incoming.id)]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, maxStoredPushMessages);

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

const idbUpdate = (
  factory: IDBFactory,
  key: string,
  updater: (prev: unknown) => unknown,
): Promise<void> =>
  openIndexedDb(factory).then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        const getReq = store.get(key);
        getReq.onsuccess = () => {
          store.put(updater(getReq.result), key);
        };
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
  getConversationMessages: (conversationId) =>
    Promise.resolve(
      parseStoredPushMessages(
        entries.get(`${conversationMessagesPrefix}${conversationId}`),
      ),
    ),
  appendConversationMessage: (conversationId, message) => {
    const mapKey = `${conversationMessagesPrefix}${conversationId}`;
    entries.set(
      mapKey,
      mergeStoredPushMessage(
        parseStoredPushMessages(entries.get(mapKey)),
        message,
      ),
    );
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
  getConversationMessages: (conversationId) =>
    idbGet(factory, `${conversationMessagesPrefix}${conversationId}`)
      .then(parseStoredPushMessages)
      .catch(() => []),
  appendConversationMessage: (conversationId, message) =>
    idbUpdate(
      factory,
      `${conversationMessagesPrefix}${conversationId}`,
      (prev) => mergeStoredPushMessage(parseStoredPushMessages(prev), message),
    ).catch(() => {}),
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
  getConversationMessages: (id) =>
    resolveActiveStore().getConversationMessages(id),
  appendConversationMessage: (id, msg) =>
    resolveActiveStore().appendConversationMessage(id, msg),
  getPushEndpoint: () => resolveActiveStore().getPushEndpoint(),
  setPushEndpoint: (endpoint) => resolveActiveStore().setPushEndpoint(endpoint),
  clear: () => resolveActiveStore().clear(),
};

export const savePushCredentials = (credentials: Credentials) =>
  defaultPushKeyStore.setCredentials(credentials);

export const savePushConversationKey = (conversationId: string, key: string) =>
  defaultPushKeyStore.setConversationKey(conversationId, key);

export const loadPushConversationKey = (conversationId: string) =>
  defaultPushKeyStore.getConversationKey(conversationId);

export const loadPushConversationMessages = (conversationId: string) =>
  defaultPushKeyStore.getConversationMessages(conversationId);

export const clearPushKeyStore = () => defaultPushKeyStore.clear();
