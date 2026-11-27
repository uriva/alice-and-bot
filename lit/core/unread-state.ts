import { nonempty } from "@uri/gamla";
import type { ConversationPreview } from "./conversation-previews.ts";
import type { Conversation } from "./subscriptions.ts";

export const unreadStateStorageKey = "alicebot_unread_state";

export type StoredUnreadState = {
  publicSignKey: string;
  initializedAt: number;
  lastReadAt: Record<string, number>;
  markedUnread: Record<string, true>;
};

export type ConversationUnreadStatus = {
  isUnread: boolean;
  count: number;
  overflow: boolean;
  markedUnread: boolean;
  effectiveReadAt: number;
};

export type UnreadSummary = {
  activeUnreadChats: number;
  activeUnreadMessages: number;
  archivedUnreadChats: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseNumberRecord = (value: unknown): Record<string, number> =>
  isRecord(value)
    ? Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, number] =>
          typeof entry[1] === "number" && Number.isFinite(entry[1]),
      ),
    )
    : {};

const parseTrueRecord = (value: unknown): Record<string, true> =>
  isRecord(value)
    ? Object.fromEntries(
      Object.entries(value)
        .filter((entry) => entry[1] === true)
        .map(([k]): [string, true] => [k, true]),
    )
    : {};

export const parseStoredUnreadState = (
  raw: string | null | undefined,
  publicSignKey: string,
): StoredUnreadState | null => {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      !isRecord(parsed) ||
      parsed.publicSignKey !== publicSignKey ||
      typeof parsed.initializedAt !== "number" ||
      !Number.isFinite(parsed.initializedAt)
    ) {
      return null;
    }
    return {
      publicSignKey,
      initializedAt: parsed.initializedAt,
      lastReadAt: parseNumberRecord(parsed.lastReadAt),
      markedUnread: parseTrueRecord(parsed.markedUnread),
    };
  } catch {
    return null;
  }
};

export const readUnreadState = (
  publicSignKey: string,
): StoredUnreadState | null => {
  try {
    return parseStoredUnreadState(
      globalThis.localStorage?.getItem(unreadStateStorageKey),
      publicSignKey,
    );
  } catch {
    return null;
  }
};

export const writeUnreadState = (state: StoredUnreadState) => {
  try {
    if (!globalThis.localStorage?.getItem("alicebot_credentials")) return;
    globalThis.localStorage.setItem(
      unreadStateStorageKey,
      JSON.stringify(state),
    );
  } catch {
    // ignore quota errors
  }
};

export const seedUnreadState = (
  state: StoredUnreadState | null,
  publicSignKey: string,
  conversations: readonly Pick<Conversation, "id" | "updatedAt">[],
  nowMs = Date.now(),
): StoredUnreadState => {
  if (state && state.publicSignKey === publicSignKey) return state;
  const lastReadAt = Object.fromEntries(
    conversations.map((conv) => [
      conv.id,
      conv.updatedAt && conv.updatedAt > 0 ? conv.updatedAt : nowMs,
    ]),
  );
  return {
    publicSignKey,
    initializedAt: nowMs,
    lastReadAt,
    markedUnread: {},
  };
};

export const latestKnownConversationTimestamp = (
  conversation?: Pick<Conversation, "updatedAt">,
  preview?: ConversationPreview,
): number =>
  Math.max(
    conversation?.updatedAt ?? 0,
    preview?.timestamp ?? 0,
    preview?.updatedAt ?? 0,
    preview?.recentMessages?.[0]?.timestamp ?? 0,
  );

export const markConversationRead = (
  state: StoredUnreadState,
  conversationId: string,
  readUpToTimestamp: number,
): StoredUnreadState => {
  const prevReadAt = state.lastReadAt[conversationId];
  const nextReadAt = Math.max(prevReadAt ?? 0, readUpToTimestamp);
  const wasMarked = Boolean(state.markedUnread[conversationId]);
  if (prevReadAt === nextReadAt && !wasMarked) return state;
  const { [conversationId]: _removed, ...restMarked } = state.markedUnread;
  return {
    ...state,
    lastReadAt: {
      ...state.lastReadAt,
      [conversationId]: nextReadAt,
    },
    markedUnread: restMarked,
  };
};

export const markConversationUnread = (
  state: StoredUnreadState,
  conversationId: string,
): StoredUnreadState => {
  if (state.markedUnread[conversationId]) return state;
  return {
    ...state,
    markedUnread: {
      ...state.markedUnread,
      [conversationId]: true,
    },
  };
};

export const computeConversationUnread = ({
  conversationId,
  preview,
  selfPublicSignKey,
  state,
  isActivelyViewing,
}: {
  conversationId: string;
  preview: ConversationPreview | undefined;
  selfPublicSignKey: string;
  state: StoredUnreadState | null;
  isActivelyViewing: boolean;
}): ConversationUnreadStatus => {
  const manuallyMarked = Boolean(state?.markedUnread[conversationId]);
  const baseReadAt = state && conversationId in state.lastReadAt
    ? state.lastReadAt[conversationId]
    : (state?.initializedAt ?? 0);

  if (isActivelyViewing) {
    return {
      isUnread: manuallyMarked,
      count: 0,
      overflow: false,
      markedUnread: manuallyMarked,
      effectiveReadAt: baseReadAt,
    };
  }

  if (!preview || preview.empty) {
    return {
      isUnread: manuallyMarked,
      count: 0,
      overflow: false,
      markedUnread: manuallyMarked,
      effectiveReadAt: baseReadAt,
    };
  }

  if (preview.recentMessages && nonempty(preview.recentMessages)) {
    const latestSelfTs = preview.recentMessages.reduce(
      (max, msg) =>
        msg.authorPublicSignKey === selfPublicSignKey && msg.timestamp > max
          ? msg.timestamp
          : max,
      0,
    );
    const effectiveReadAt = Math.max(baseReadAt, latestSelfTs);
    const count = preview.recentMessages.filter(
      (msg) =>
        msg.authorPublicSignKey !== selfPublicSignKey &&
        msg.timestamp > effectiveReadAt,
    ).length;
    const overflow = count > 0 &&
      Boolean(preview.fetchedFullPage) &&
      (preview.oldestFetchedTimestamp ?? 0) > effectiveReadAt;
    return {
      isUnread: count > 0 || manuallyMarked,
      count,
      overflow,
      markedUnread: manuallyMarked,
      effectiveReadAt,
    };
  }

  if (preview.authorPublicSignKey === selfPublicSignKey) {
    return {
      isUnread: manuallyMarked,
      count: 0,
      overflow: false,
      markedUnread: manuallyMarked,
      effectiveReadAt: Math.max(baseReadAt, preview.timestamp),
    };
  }

  if (preview.timestamp > baseReadAt) {
    return {
      isUnread: true,
      count: 1,
      overflow: false,
      markedUnread: manuallyMarked,
      effectiveReadAt: baseReadAt,
    };
  }

  return {
    isUnread: manuallyMarked,
    count: 0,
    overflow: false,
    markedUnread: manuallyMarked,
    effectiveReadAt: baseReadAt,
  };
};

export const formatUnreadBadgeLabel = (
  count: number,
  overflow = false,
): string => {
  if (count <= 0) return "";
  if (count > 99) return "99+";
  return overflow ? `${count}+` : String(count);
};

export const summarizeUnreadCounts = <T extends Pick<Conversation, "id">>(
  conversations: readonly T[] | null,
  getStatus: (conv: T) => ConversationUnreadStatus,
  isArchived: (conv: T) => boolean = () => false,
): UnreadSummary =>
  (conversations ?? []).reduce<UnreadSummary>(
    (acc, conv) => {
      const status = getStatus(conv);
      if (!status.isUnread) return acc;
      if (isArchived(conv)) {
        return {
          ...acc,
          archivedUnreadChats: acc.archivedUnreadChats + 1,
        };
      }
      return {
        ...acc,
        activeUnreadChats: acc.activeUnreadChats + 1,
        activeUnreadMessages: acc.activeUnreadMessages +
          (status.count > 0 ? status.count : 1),
      };
    },
    { activeUnreadChats: 0, activeUnreadMessages: 0, archivedUnreadChats: 0 },
  );

export const formatDocumentTitle = (
  baseTitle: string,
  unreadChatsCount: number,
): string => (unreadChatsCount > 0
  ? `(${unreadChatsCount}) ${baseTitle}`
  : baseTitle);

export const findUnreadDividerInfo = <
  M extends { id: string; authorId: string; timestamp: number },
>(
  messages: readonly M[],
  userId: string,
  unreadDividerAfterTimestamp: number | undefined,
): { firstUnreadMessageId: string; count: number } | null => {
  if (unreadDividerAfterTimestamp === undefined) return null;
  const unread = messages.filter(
    (m) => m.authorId !== userId && m.timestamp > unreadDividerAfterTimestamp,
  );
  if (!nonempty(unread)) return null;
  return { firstUnreadMessageId: unread[0].id, count: unread.length };
};

export const subscribeUnreadStateStorage = (
  publicSignKey: string,
  onChange: (state: StoredUnreadState) => void,
): () => void => {
  if (typeof globalThis.addEventListener !== "function") return () => {};
  const handler = (event: StorageEvent) => {
    if (event.key !== unreadStateStorageKey) return;
    const next = parseStoredUnreadState(event.newValue, publicSignKey);
    if (next) onChange(next);
  };
  globalThis.addEventListener("storage", handler);
  return () => globalThis.removeEventListener("storage", handler);
};

const faviconState: {
  baseHref: string | null;
  dotDataUrl: string | null;
  pending: boolean;
  hasUnread: boolean;
} = {
  baseHref: null,
  dotDataUrl: null,
  pending: false,
  hasUnread: false,
};

const findFaviconLink = (): HTMLLinkElement | null =>
  typeof document !== "undefined"
    ? document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    : null;

const drawFaviconWithDot = (img: HTMLImageElement): string | null => {
  if (typeof document === "undefined") return null;
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, size, size);
  const cx = size - 7;
  const cy = 7;
  ctx.beginPath();
  ctx.arc(cx, cy, 7, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, 5.2, 0, Math.PI * 2);
  ctx.fillStyle = "#2563eb";
  ctx.fill();
  return canvas.toDataURL("image/png");
};

export const syncFaviconDot = (hasUnread: boolean) => {
  faviconState.hasUnread = hasUnread;
  const link = findFaviconLink();
  if (!link) return;
  if (!faviconState.baseHref) {
    faviconState.baseHref = link.getAttribute("href") || "/icon-alice.png";
  }
  if (!hasUnread) {
    if (link.getAttribute("href") !== faviconState.baseHref) {
      link.setAttribute("href", faviconState.baseHref);
    }
    return;
  }
  if (faviconState.dotDataUrl) {
    if (link.getAttribute("href") !== faviconState.dotDataUrl) {
      link.setAttribute("href", faviconState.dotDataUrl);
    }
    return;
  }
  if (faviconState.pending || typeof Image === "undefined") return;
  faviconState.pending = true;
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    faviconState.pending = false;
    const dataUrl = drawFaviconWithDot(img);
    if (!dataUrl) return;
    faviconState.dotDataUrl = dataUrl;
    if (faviconState.hasUnread) {
      findFaviconLink()?.setAttribute("href", dataUrl);
    }
  };
  img.onerror = () => {
    faviconState.pending = false;
  };
  img.src = faviconState.baseHref;
};

const appBadgeState: { lastSent: number | null } = { lastSent: null };

export const syncNavigatorAppBadge = (unreadCount: number) => {
  const normalized = unreadCount > 0 ? unreadCount : 0;
  if (appBadgeState.lastSent === normalized) return;
  appBadgeState.lastSent = normalized;
  const nav = globalThis.navigator;
  if (!nav) return;
  if (normalized > 0) {
    if ("setAppBadge" in nav && typeof nav.setAppBadge === "function") {
      nav.setAppBadge(normalized).catch(() => {});
    }
    return;
  }
  if ("clearAppBadge" in nav && typeof nav.clearAppBadge === "function") {
    nav.clearAppBadge().catch(() => {});
  }
};
