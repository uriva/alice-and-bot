import { empty } from "@uri/gamla";
import type { PushSubscriptionJSON } from "../../instant.schema.ts";
import type { EncryptedConversationKey } from "../../protocol/src/clientApi.ts";
import { normalizeAlias } from "../../protocol/src/alias.ts";
import { getDb, query } from "./db.ts";

export type CacheLookup<V> = { hit: true; value: V } | { hit: false };

export type TtlCache<V> = {
  get: (key: string) => CacheLookup<V>;
  set: (key: string, value: V) => void;
  delete: (key: string) => void;
  deleteWhere: (predicate: (key: string, value: V) => boolean) => void;
  clear: () => void;
  size: () => number;
  generation: () => number;
};

export const createTtlCache = <V>({
  ttlMs,
  maxEntries,
  now = Date.now,
}: {
  ttlMs: number;
  maxEntries: number;
  now?: () => number;
}): TtlCache<V> => {
  const entries = new Map<string, { value: V; expiresAt: number }>();
  const state = { gen: 0 };

  const pruneExpired = (ts: number) => {
    entries.forEach((entry, key) => {
      if (ts > entry.expiresAt) entries.delete(key);
    });
  };

  return {
    get: (key: string): CacheLookup<V> => {
      const entry = entries.get(key);
      if (!entry) return { hit: false };
      if (now() > entry.expiresAt) {
        entries.delete(key);
        return { hit: false };
      }
      entries.delete(key);
      entries.set(key, entry);
      return { hit: true, value: entry.value };
    },
    set: (key: string, value: V) => {
      const ts = now();
      if (!entries.has(key) && entries.size >= maxEntries) {
        pruneExpired(ts);
        if (entries.size >= maxEntries) {
          const excess = entries.size - maxEntries + 1;
          Array.from(entries.keys())
            .slice(0, excess)
            .forEach((k) => entries.delete(k));
        }
      }
      entries.delete(key);
      entries.set(key, { value, expiresAt: ts + ttlMs });
    },
    delete: (key: string) => {
      state.gen += 1;
      entries.delete(key);
    },
    deleteWhere: (predicate: (key: string, value: V) => boolean) => {
      state.gen += 1;
      entries.forEach((entry, key) => {
        if (predicate(key, entry.value)) entries.delete(key);
      });
    },
    clear: () => {
      state.gen += 1;
      entries.clear();
    },
    size: () => entries.size,
    generation: () => state.gen,
  };
};

export type CachedConversationParticipant = {
  id: string;
  publicSignKey: string;
  name?: string;
  avatar?: string;
  alias?: string;
  webhook?: string;
  keys?: { key: EncryptedConversationKey }[];
};

export type CachedConversation = {
  id: string;
  title: string;
  participants: CachedConversationParticipant[];
  hasCanvas: boolean;
};

export type CachedIdentity = {
  id: string;
  publicSignKey: string;
  name?: string;
  avatar?: string;
  alias?: string;
  shortId?: string;
  priceTag?: number;
  webhook?: string;
  instantEmail?: string;
};

export type StoredPushRow = {
  id: string;
  subscription: PushSubscriptionJSON;
  owner?: { id: string };
  conversation?: { id: string };
};

const CONVERSATION_CACHE_TTL_MS = 3 * 60 * 1000;
const IDENTITY_CACHE_TTL_MS = 3 * 60 * 1000;
const PUSH_SUBS_CACHE_TTL_MS = 3 * 60 * 1000;
const CONVERSATION_KEY_CACHE_TTL_MS = 10 * 60 * 1000;

type BackendCaches = {
  conversations: TtlCache<CachedConversation>;
  identityByPublicSignKey: TtlCache<CachedIdentity>;
  identityByAlias: TtlCache<CachedIdentity>;
  identityByShortId: TtlCache<CachedIdentity>;
  pushSubscriptions: TtlCache<StoredPushRow[]>;
  conversationKeys: TtlCache<EncryptedConversationKey>;
};

const createBackendCaches = (): BackendCaches => ({
  conversations: createTtlCache<CachedConversation>({
    ttlMs: CONVERSATION_CACHE_TTL_MS,
    maxEntries: 5_000,
  }),
  identityByPublicSignKey: createTtlCache<CachedIdentity>({
    ttlMs: IDENTITY_CACHE_TTL_MS,
    maxEntries: 10_000,
  }),
  identityByAlias: createTtlCache<CachedIdentity>({
    ttlMs: IDENTITY_CACHE_TTL_MS,
    maxEntries: 10_000,
  }),
  identityByShortId: createTtlCache<CachedIdentity>({
    ttlMs: IDENTITY_CACHE_TTL_MS,
    maxEntries: 10_000,
  }),
  pushSubscriptions: createTtlCache<StoredPushRow[]>({
    ttlMs: PUSH_SUBS_CACHE_TTL_MS,
    maxEntries: 10_000,
  }),
  conversationKeys: createTtlCache<EncryptedConversationKey>({
    ttlMs: CONVERSATION_KEY_CACHE_TTL_MS,
    maxEntries: 10_000,
  }),
});

const cachesByDb = new WeakMap<object, BackendCaches>();

const activeCaches = (): BackendCaches => {
  const db = getDb();
  const existing = cachesByDb.get(db);
  if (existing) return existing;
  const fresh = createBackendCaches();
  cachesByDb.set(db, fresh);
  return fresh;
};

export const clearBackendCaches = () => {
  const c = activeCaches();
  c.conversations.clear();
  c.identityByPublicSignKey.clear();
  c.identityByAlias.clear();
  c.identityByShortId.clear();
  c.pushSubscriptions.clear();
  c.conversationKeys.clear();
};

const toCachedIdentity = (raw: {
  id: string;
  publicSignKey: string;
  name?: string;
  avatar?: string;
  alias?: string;
  shortId?: string;
  priceTag?: number;
  webhook?: string;
  instantEmail?: string;
}): CachedIdentity => ({
  id: raw.id,
  publicSignKey: raw.publicSignKey,
  ...(raw.name !== undefined ? { name: raw.name } : {}),
  ...(raw.avatar !== undefined ? { avatar: raw.avatar } : {}),
  ...(raw.alias !== undefined ? { alias: raw.alias } : {}),
  ...(raw.shortId !== undefined ? { shortId: raw.shortId } : {}),
  ...(raw.priceTag !== undefined ? { priceTag: raw.priceTag } : {}),
  ...(raw.webhook !== undefined ? { webhook: raw.webhook } : {}),
  ...(raw.instantEmail !== undefined ? { instantEmail: raw.instantEmail } : {}),
});

export const cacheIdentity = (identity: CachedIdentity) => {
  const c = activeCaches();
  c.identityByPublicSignKey.set(identity.publicSignKey, identity);
  if (identity.alias) {
    c.identityByAlias.set(normalizeAlias(identity.alias), identity);
  }
  if (identity.shortId) {
    c.identityByShortId.set(identity.shortId, identity);
  }
};

export const peekCachedIdentityByPublicSignKey = (
  publicSignKey: string,
): CachedIdentity | undefined => {
  const hit = activeCaches().identityByPublicSignKey.get(publicSignKey);
  return hit.hit ? hit.value : undefined;
};

export const peekCachedIdentityByAlias = (
  alias: string,
): CachedIdentity | undefined => {
  const hit = activeCaches().identityByAlias.get(normalizeAlias(alias));
  return hit.hit ? hit.value : undefined;
};

export const peekCachedIdentityByShortId = (
  shortId: string,
): CachedIdentity | undefined => {
  const hit = activeCaches().identityByShortId.get(shortId);
  return hit.hit ? hit.value : undefined;
};

export const getCachedIdentityByPublicSignKey = async (
  publicSignKey: string,
): Promise<CachedIdentity | null> => {
  const c = activeCaches();
  const cached = c.identityByPublicSignKey.get(publicSignKey);
  if (cached.hit) return cached.value;
  const gen = c.identityByPublicSignKey.generation();
  const { identities } = await query({
    identities: { $: { where: { publicSignKey } } },
  });
  if (empty(identities)) return null;
  const identity = toCachedIdentity(identities[0]);
  if (c.identityByPublicSignKey.generation() === gen) {
    cacheIdentity(identity);
  }
  return identity;
};

export const getCachedIdentityByAlias = async (
  alias: string,
): Promise<CachedIdentity | null> => {
  const normalized = normalizeAlias(alias);
  const c = activeCaches();
  const cached = c.identityByAlias.get(normalized);
  if (cached.hit) return cached.value;
  const gen = c.identityByAlias.generation();
  const { identities } = await query({
    identities: { $: { where: { alias: normalized } } },
  });
  if (empty(identities)) return null;
  const identity = toCachedIdentity(identities[0]);
  if (c.identityByAlias.generation() === gen) {
    cacheIdentity(identity);
  }
  return identity;
};

export const getCachedIdentityByShortId = async (
  shortId: string,
): Promise<CachedIdentity | null> => {
  const c = activeCaches();
  const cached = c.identityByShortId.get(shortId);
  if (cached.hit) return cached.value;
  const gen = c.identityByShortId.generation();
  const { identities } = await query({
    identities: { $: { where: { shortId } } },
  });
  if (empty(identities)) return null;
  const identity = toCachedIdentity(identities[0]);
  if (c.identityByShortId.generation() === gen) {
    cacheIdentity(identity);
  }
  return identity;
};

export const getCachedIdentitiesByPublicSignKeys = async (
  publicSignKeys: string[],
): Promise<CachedIdentity[]> => {
  const uniqueKeys = Array.from(new Set(publicSignKeys));
  if (empty(uniqueKeys)) return [];
  const c = activeCaches();
  const found: CachedIdentity[] = [];
  const missing: string[] = [];
  uniqueKeys.forEach((pk) => {
    const hit = c.identityByPublicSignKey.get(pk);
    if (hit.hit) found.push(hit.value);
    else missing.push(pk);
  });
  if (empty(missing)) return found;
  const gen = c.identityByPublicSignKey.generation();
  const { identities } = await query({
    identities: { $: { where: { publicSignKey: { $in: missing } } } },
  });
  const fetched = identities.map(toCachedIdentity);
  if (c.identityByPublicSignKey.generation() === gen) {
    fetched.forEach(cacheIdentity);
  }
  return [...found, ...fetched];
};

export const invalidateConversationsForParticipant = (
  publicSignKey: string,
) => {
  activeCaches().conversations.deleteWhere(
    (_id, conv) =>
      conv.participants.some((p) => p.publicSignKey === publicSignKey),
  );
};

export const invalidateIdentity = (
  publicSignKey: string,
  extra?: { aliases?: (string | undefined)[]; shortId?: string },
) => {
  const c = activeCaches();
  const existing = c.identityByPublicSignKey.get(publicSignKey);
  c.identityByPublicSignKey.delete(publicSignKey);
  const aliases = [
    ...(existing.hit ? [existing.value.alias] : []),
    ...(extra?.aliases ?? []),
  ];
  aliases.forEach((alias) => {
    if (alias) c.identityByAlias.delete(normalizeAlias(alias));
  });
  const shortIds = [
    ...(existing.hit ? [existing.value.shortId] : []),
    extra?.shortId,
  ];
  shortIds.forEach((sid) => {
    if (sid) c.identityByShortId.delete(sid);
  });
  invalidateConversationsForParticipant(publicSignKey);
};

export const invalidateConversation = (conversationId: string) => {
  activeCaches().conversations.delete(conversationId);
};

export const getCachedConversation = async (
  conversationId: string,
): Promise<CachedConversation | null> => {
  const c = activeCaches();
  const cached = c.conversations.get(conversationId);
  if (cached.hit) return cached.value;
  const convGen = c.conversations.generation();
  const keyGen = c.conversationKeys.generation();
  const { conversations } = await query({
    conversations: {
      participants: {
        keys: {
          $: { where: { conversation: conversationId } },
        },
      },
      canvas: {},
      $: { where: { id: conversationId } },
    },
  });
  if (empty(conversations)) return null;
  const raw = conversations[0];
  const conv: CachedConversation = {
    id: raw.id,
    title: raw.title,
    participants: raw.participants.map((p) => ({
      id: p.id,
      publicSignKey: p.publicSignKey,
      ...(p.name !== undefined ? { name: p.name } : {}),
      ...(p.avatar !== undefined ? { avatar: p.avatar } : {}),
      ...(p.alias !== undefined ? { alias: p.alias } : {}),
      ...(p.webhook !== undefined ? { webhook: p.webhook } : {}),
      ...(p.keys !== undefined ? { keys: p.keys } : {}),
    })),
    hasCanvas: Boolean(
      raw.canvas && (Array.isArray(raw.canvas) ? raw.canvas.length > 0 : true),
    ),
  };
  if (c.conversations.generation() === convGen) {
    c.conversations.set(conversationId, conv);
  }
  if (c.conversationKeys.generation() === keyGen) {
    conv.participants.forEach((p) => {
      const k = p.keys?.[0]?.key;
      if (k) {
        c.conversationKeys.set(`${p.publicSignKey}:${conversationId}`, k);
      }
    });
  }
  return conv;
};

export const cacheConversationKey = (
  publicSignKey: string,
  conversationId: string,
  key: EncryptedConversationKey,
) => {
  activeCaches().conversationKeys.set(
    `${publicSignKey}:${conversationId}`,
    key,
  );
};

export const getCachedConversationKey = async (
  publicSignKey: string,
  conversationId: string,
): Promise<EncryptedConversationKey | null> => {
  const c = activeCaches();
  const cacheKey = `${publicSignKey}:${conversationId}`;
  const cached = c.conversationKeys.get(cacheKey);
  if (cached.hit) return cached.value;
  const gen = c.conversationKeys.generation();
  const { identities } = await query({
    identities: {
      $: { where: { publicSignKey } },
      keys: {
        $: { where: { conversation: conversationId } },
      },
    },
  });
  const keys = identities[0]?.keys ?? [];
  if (empty(keys)) return null;
  const key = keys[0].key;
  if (c.conversationKeys.generation() === gen) {
    c.conversationKeys.set(cacheKey, key);
  }
  return key;
};

export const peekCachedPushSubscriptions = (
  identityId: string,
): CacheLookup<StoredPushRow[]> =>
  activeCaches().pushSubscriptions.get(identityId);

export const setCachedPushSubscriptions = (
  identityId: string,
  rows: StoredPushRow[],
) => {
  activeCaches().pushSubscriptions.set(identityId, rows);
};

export const invalidatePushSubscriptions = (identityId: string) => {
  activeCaches().pushSubscriptions.delete(identityId);
};

export const getCachedPushSubscriptionsForIdentities = async (
  identityIds: string[],
): Promise<StoredPushRow[]> => {
  const uniqueIds = Array.from(new Set(identityIds));
  if (empty(uniqueIds)) return [];
  const c = activeCaches();
  const cachedRows: StoredPushRow[] = [];
  const missingIds: string[] = [];
  uniqueIds.forEach((ownerId) => {
    const hit = c.pushSubscriptions.get(ownerId);
    if (hit.hit) cachedRows.push(...hit.value);
    else missingIds.push(ownerId);
  });
  if (empty(missingIds)) return cachedRows;
  const gen = c.pushSubscriptions.generation();
  const { pushSubscriptions } = await query({
    pushSubscriptions: {
      owner: {},
      conversation: {},
      $: {
        where: { "owner.id": { $in: missingIds } },
      },
    },
  });
  const grouped = new Map<string, StoredPushRow[]>(
    missingIds.map((ownerId) => [ownerId, []]),
  );
  pushSubscriptions.forEach((row) => {
    const ownerId = row.owner?.id;
    if (!ownerId) return;
    const normalized: StoredPushRow = {
      id: row.id,
      subscription: row.subscription,
      owner: { id: ownerId },
      ...(row.conversation
        ? { conversation: { id: row.conversation.id } }
        : {}),
    };
    const bucket = grouped.get(ownerId);
    if (bucket) bucket.push(normalized);
    else grouped.set(ownerId, [normalized]);
  });
  if (c.pushSubscriptions.generation() === gen) {
    grouped.forEach((rows, ownerId) => {
      c.pushSubscriptions.set(ownerId, rows);
    });
  }
  const fetchedRows = Array.from(grouped.values()).flat();
  return [...cachedRows, ...fetchedRows];
};

export const applyPushSubscriptionMutations = ({
  deletedIds,
  updatedById,
  affectedOwnerIds,
}: {
  deletedIds: Set<string>;
  updatedById: Map<string, PushSubscriptionJSON>;
  affectedOwnerIds: Set<string>;
}) => {
  const c = activeCaches();
  affectedOwnerIds.forEach((ownerId) => {
    const hit = c.pushSubscriptions.get(ownerId);
    if (!hit.hit) {
      c.pushSubscriptions.delete(ownerId);
      return;
    }
    const nextRows = hit.value
      .filter((row) => !deletedIds.has(row.id))
      .map((row) => {
        const updated = updatedById.get(row.id);
        return updated ? { ...row, subscription: updated } : row;
      });
    c.pushSubscriptions.set(ownerId, nextRows);
  });
};
