import { empty, nonempty } from "@uri/gamla";
import {
  dismissNotificationsSigned,
  getMessagesSigned,
} from "../../backend/src/api.ts";
import {
  type Attachment,
  type Credentials,
  decryptMessagePayload,
  type EncryptedConversationKey,
  type EncryptedMessage,
  getConversationKey,
  type InternalMessage,
  isSilentMessage,
  sendMessageWithKey,
} from "./clientApi.ts";
import { decryptAsymmetric } from "./crypto.ts";
import {
  defaultPushKeyStore,
  type PushKeyStore,
  type StoredPushMessage,
} from "./pushKeyStore.ts";

export const notificationBadgePath = "/badge-96.png";
export const defaultNotificationIconPath = "/icon-192.png";

const maxStackedLines = 5;
const maxPreviewLength = 160;
const avatarSizePx = 192;
const avatarHues = [215, 16, 36, 258, 342, 198, 28, 236];

export type PushPayloadData = {
  type?: string;
  messageId?: string;
  conversationId?: string;
  conversationTitle?: string;
  senderName?: string;
  senderAvatar?: string;
  senderPublicSignKey?: string;
  isGroupChat?: boolean;
  conversationKey?: string;
  encryptedMessage?: string;
  timestamp?: number;
  lines?: string[];
  unreadCount?: number;
};

export type NotificationActionDef = {
  action: string;
  title: string;
  type?: "button" | "text";
  placeholder?: string;
};

export type ShownNotificationRecord = {
  title: string;
  tag: string;
  body: string;
  icon: string;
  badge: string;
  silent: boolean;
  renotify: boolean;
  data: Record<string, unknown>;
  actions: NotificationActionDef[];
  close: () => void;
};

export type NotificationRegistrationLike = {
  showNotification: (
    title: string,
    options: Record<string, unknown>,
  ) => Promise<void>;
  getNotifications: (filter?: {
    tag?: string;
  }) => Promise<readonly { tag?: string; data?: unknown; close: () => void }[]>;
};

export type WindowClientLike = {
  url: string;
  focused?: boolean;
  visibilityState?: string;
  focus?: () => Promise<unknown>;
  navigate?: (url: string) => Promise<unknown>;
  postMessage?: (message: unknown, transfer?: Transferable[]) => void;
};

export type ClientsLike = {
  matchAll: (options?: {
    type?: "window";
    includeUncontrolled?: boolean;
  }) => Promise<readonly WindowClientLike[]>;
  openWindow?: (url: string) => Promise<unknown>;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isEncryptedConversationKey = (
  value: unknown,
): value is EncryptedConversationKey =>
  typeof value === "string" && value.length > 0;

const isEncryptedMessage = (value: unknown): value is EncryptedMessage =>
  typeof value === "string" && value.length > 0;

const hashSeed = (str: string) =>
  Array.from(str).reduce(
    (hash, ch) => ch.charCodeAt(0) + ((hash << 5) - hash),
    0,
  );

const senderAvatarHsl = (seed: string) => {
  const hue = avatarHues[Math.abs(hashSeed(seed)) % avatarHues.length];
  return `hsl(${hue}, 44%, 42%)`;
};

const extractInitials = (label: string) => {
  const trimmed = label.trim();
  if (!trimmed) return "AB";
  const words = trimmed.split(/\s+/).filter(Boolean);
  return words.length >= 2
    ? `${words[0][0]}${words[1][0]}`.toUpperCase()
    : trimmed.slice(0, 2).toUpperCase();
};

const escapeXml = (str: string) =>
  str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const utf8ToBase64 = (text: string) =>
  btoa(
    Array.from(
      new TextEncoder().encode(text),
      (byte) => String.fromCharCode(byte),
    ).join(""),
  );

const bytesToBase64 = (bytes: Uint8Array) =>
  btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));

const blobToDataUrl = async (blob: Blob, mimeType: string) =>
  `data:${mimeType};base64,${
    bytesToBase64(new Uint8Array(await blob.arrayBuffer()))
  }`;

export const buildSvgInitialsAvatarDataUrl = (seed: string, label: string) => {
  const bg = senderAvatarHsl(seed || label || "Alice");
  const initials = escapeXml(extractInitials(label));
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${avatarSizePx}" height="${avatarSizePx}" viewBox="0 0 ${avatarSizePx} ${avatarSizePx}">` +
    `<circle cx="96" cy="96" r="96" fill="${bg}"/>` +
    `<text x="96" y="96" text-anchor="middle" dominant-baseline="central" fill="#ffffff" font-family="system-ui,-apple-system,sans-serif" font-weight="700" font-size="74">${initials}</text>` +
    `</svg>`;
  return `data:image/svg+xml;base64,${utf8ToBase64(svg)}`;
};

const renderOffscreenInitialsPng = async (
  seed: string,
  label: string,
): Promise<string | null> => {
  if (typeof globalThis.OffscreenCanvas === "undefined") return null;
  const canvas = new OffscreenCanvas(avatarSizePx, avatarSizePx);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.beginPath();
  ctx.arc(96, 96, 96, 0, Math.PI * 2);
  ctx.fillStyle = senderAvatarHsl(seed || label || "Alice");
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 74px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(extractInitials(label), 96, 100);
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return blobToDataUrl(blob, "image/png");
};

const renderOffscreenRemoteAvatarPng = async (
  avatarUrl: string,
  fetchFn: typeof fetch,
): Promise<string | null> => {
  if (
    typeof globalThis.OffscreenCanvas === "undefined" ||
    typeof globalThis.createImageBitmap === "undefined"
  ) {
    return null;
  }
  const canvas = new OffscreenCanvas(avatarSizePx, avatarSizePx);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const res = await fetchFn(avatarUrl, {
    signal: AbortSignal.timeout(2500),
  }).catch(() => null);
  if (!res || !res.ok) return null;
  const blob = await res.blob().catch(() => null);
  if (!blob) return null;
  const bitmap = await createImageBitmap(blob).catch(() => null);
  if (!bitmap) return null;
  const minSide = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - minSide) / 2;
  const sy = (bitmap.height - minSide) / 2;
  ctx.beginPath();
  ctx.arc(96, 96, 96, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(
    bitmap,
    sx,
    sy,
    minSide,
    minSide,
    0,
    0,
    avatarSizePx,
    avatarSizePx,
  );
  bitmap.close();
  const outBlob = await canvas.convertToBlob({ type: "image/png" });
  return blobToDataUrl(outBlob, "image/png");
};

export const resolveSenderAvatarIcon = async ({
  senderAvatar,
  senderPublicSignKey,
  label,
  fetchFn = globalThis.fetch,
}: {
  senderAvatar?: string;
  senderPublicSignKey?: string;
  label: string;
  fetchFn?: typeof fetch;
}): Promise<string> => {
  if (
    senderAvatar &&
    (senderAvatar.startsWith("https://") || senderAvatar.startsWith("http://"))
  ) {
    const cropped = await renderOffscreenRemoteAvatarPng(senderAvatar, fetchFn);
    if (cropped) return cropped;
  }
  const seed = senderPublicSignKey || label;
  const renderedPng = await renderOffscreenInitialsPng(seed, label);
  return renderedPng ?? buildSvgInitialsAvatarDataUrl(seed, label);
};

const parseUrlSafe = (rawUrl: string): URL | null => {
  try {
    return new URL(rawUrl, "https://aliceandbot.com");
  } catch {
    return null;
  }
};

const activeConversationQueryTimeoutMs = 250;

const isWindowClientVisible = (client: {
  focused?: boolean;
  visibilityState?: string;
}) => Boolean(client.focused || client.visibilityState === "visible");

const isClientUrlMatchingConversation = (
  url: string,
  conversationId: string,
) => {
  const parsed = parseUrlSafe(url);
  return Boolean(
    parsed &&
      parsed.pathname === "/chat" &&
      parsed.searchParams.get("c") === conversationId,
  );
};

export const isConversationFocused = (
  clients: readonly {
    focused?: boolean;
    visibilityState?: string;
    url: string;
  }[],
  conversationId?: string,
): boolean => {
  if (!conversationId) return false;
  return clients.some(
    (client) =>
      isWindowClientVisible(client) &&
      isClientUrlMatchingConversation(client.url, conversationId),
  );
};

const queryClientActiveConversation = (
  client: WindowClientLike,
  timeoutMs = activeConversationQueryTimeoutMs,
): Promise<string | null | undefined> => {
  const postMessage = client.postMessage;
  if (
    !postMessage ||
    typeof globalThis.MessageChannel === "undefined"
  ) {
    return Promise.resolve(undefined);
  }
  const channel = new MessageChannel();
  return new Promise((resolve) => {
    const finish = (
      result: string | null | undefined,
      closePort2: boolean,
    ) => {
      clearTimeout(timer);
      channel.port1.onmessage = null;
      channel.port1.close();
      if (closePort2) channel.port2.close();
      resolve(result);
    };
    const timer = setTimeout(() => finish(undefined, true), timeoutMs);
    channel.port1.onmessage = (event: MessageEvent) => {
      const payload: unknown = event.data;
      if (!isPlainObject(payload) || !("conversationId" in payload)) {
        finish(undefined, false);
        return;
      }
      finish(
        typeof payload.conversationId === "string"
          ? payload.conversationId
          : null,
        false,
      );
    };
    try {
      postMessage.call(client, { type: "alice:query-active-conversation" }, [
        channel.port2,
      ]);
    } catch {
      finish(undefined, true);
    }
  });
};

const resolveIsConversationFocused = async (
  clients: readonly WindowClientLike[],
  conversationId?: string,
): Promise<boolean> => {
  if (!conversationId) return false;
  const visibleClients = clients.filter(isWindowClientVisible);
  if (empty(visibleClients)) return false;
  const responses = await Promise.all(
    visibleClients.map((client) => queryClientActiveConversation(client)),
  );
  return visibleClients.some((client, index) => {
    const activeId = responses[index];
    if (activeId !== undefined) return activeId === conversationId;
    return isClientUrlMatchingConversation(client.url, conversationId);
  });
};

const truncatePreview = (text: string) =>
  text.length <= maxPreviewLength
    ? text
    : `${text.slice(0, maxPreviewLength - 1).trimEnd()}…`;

export const stripMarkdownForPreview = (markdown: string): string =>
  truncatePreview(
    markdown
      .replace(/```[\w-]*\n?([\s\S]*?)```/g, "$1")
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/^>\s?/gm, "")
      .replace(/(\*\*|__)(.*?)\1/g, "$2")
      .replace(/(\*|_)(.*?)\1/g, "$2")
      .replace(/~~(.*?)~~/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\s+/g, " ")
      .trim(),
  );

const formatAudioDuration = (seconds?: number) => {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return "";
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = String(total % 60).padStart(2, "0");
  return ` (${mins}:${secs})`;
};

const formatAttachmentSummary = (attachment: Attachment, cleanText: string) => {
  if (attachment.type === "image") {
    return cleanText ? `📷 ${cleanText}` : "📷 Photo";
  }
  if (attachment.type === "audio") {
    return cleanText
      ? `🎤 ${cleanText}`
      : `🎤 Voice message${formatAudioDuration(attachment.duration)}`;
  }
  if (attachment.type === "video") {
    return cleanText ? `🎥 ${cleanText}` : "🎥 Video";
  }
  if (attachment.type === "location") {
    return cleanText
      ? `📍 ${cleanText}`
      : `📍 ${attachment.label || "Location"}`;
  }
  return cleanText ? `📎 ${cleanText}` : `📎 ${attachment.name || "File"}`;
};

export const formatMessagePreview = <
  M extends {
    type: InternalMessage["type"];
    text?: string;
    attachments?: Attachment[];
    emoji?: string;
    remove?: boolean;
    action?: string;
  },
>(
  message: M,
): string | null => {
  if (isSilentMessage(message)) return null;
  if (message.type === "reaction") {
    return `Reacted ${message.emoji ?? ""} to a message`.trim();
  }
  if (message.type === "call") {
    return "📞 Incoming voice call";
  }
  const cleanText = stripMarkdownForPreview(message.text ?? "");
  if (message.attachments && nonempty(message.attachments)) {
    return formatAttachmentSummary(message.attachments[0], cleanText);
  }
  return cleanText || "New message";
};

const resolveConversationSymmetricKey = async ({
  conversationId,
  encryptedConversationKey,
  credentials,
  keyStore,
}: {
  conversationId: string;
  encryptedConversationKey?: string;
  credentials: Credentials;
  keyStore: PushKeyStore;
}): Promise<string | null> => {
  const cached = await keyStore.getConversationKey(conversationId);
  if (cached) return cached;
  if (isEncryptedConversationKey(encryptedConversationKey)) {
    const decrypted = await decryptAsymmetric<string>(
      credentials.privateEncryptKey,
      encryptedConversationKey,
    ).catch(() => null);
    if (decrypted) {
      await keyStore.setConversationKey(conversationId, decrypted);
      return decrypted;
    }
  }
  const fetched = await getConversationKey(credentials, conversationId).catch(
    () => null,
  );
  if (fetched) {
    await keyStore.setConversationKey(conversationId, fetched);
  }
  return fetched;
};

const defaultFetchLatestCiphertext = async ({
  conversationId,
  messageId,
  credentials,
}: {
  conversationId: string;
  messageId?: string;
  credentials: Credentials;
}): Promise<string | null> => {
  const res = await getMessagesSigned({
    conversationId,
    limit: 5,
    credentials,
  }).catch(() => null);
  if (!res || "error" in res || empty(res.messages)) return null;
  const matched = messageId
    ? res.messages.find((m) => m.id === messageId)
    : res.messages[0];
  const candidate = (matched ?? res.messages[0])?.payload;
  return typeof candidate === "string" ? candidate : null;
};

const readStoredLines = (existingData: unknown): string[] => {
  if (!isPlainObject(existingData) || !Array.isArray(existingData.lines)) {
    return [];
  }
  return existingData.lines.filter((line): line is string =>
    typeof line === "string"
  );
};

const readStoredUnreadCount = (existingData: unknown): number =>
  isPlainObject(existingData) &&
    typeof existingData.unreadCount === "number" &&
    existingData.unreadCount > 0
    ? existingData.unreadCount
    : 0;

export const syncAppBadgeFromNotifications = async ({
  registration,
  setAppBadge,
  clearAppBadge,
}: {
  registration: NotificationRegistrationLike;
  setAppBadge?: (count: number) => Promise<unknown>;
  clearAppBadge?: () => Promise<unknown>;
}) => {
  const all = await registration.getNotifications();
  const totalUnread = all.reduce(
    (sum, n) => sum + Math.max(1, readStoredUnreadCount(n.data)),
    0,
  );
  if (totalUnread > 0) {
    await setAppBadge?.(totalUnread)?.catch(() => {});
    return;
  }
  await clearAppBadge?.()?.catch(() => {});
};

const closeMatchingNotifications = async (
  registration: NotificationRegistrationLike,
  tag: string,
) => {
  const matching = await registration.getNotifications({ tag });
  matching.forEach((n) => n.close());
  return matching.length;
};

const defaultNotificationActions: NotificationActionDef[] = [
  {
    action: "reply",
    type: "text",
    title: "Reply",
    placeholder: "Type a reply…",
  },
  {
    action: "mark-read",
    title: "Mark as read",
  },
];

const resolveBaseTitle = (data: PushPayloadData) =>
  data.isGroupChat && data.conversationTitle
    ? data.conversationTitle
    : data.senderName || data.conversationTitle || "Alice&Bot";

const formatLineForStack = (data: PushPayloadData, preview: string) =>
  data.isGroupChat &&
    data.senderName &&
    data.conversationTitle &&
    data.senderName !== data.conversationTitle
    ? `${data.senderName}: ${preview}`
    : preview;

const fallbackPreviewBody = (data: PushPayloadData) =>
  data.senderName &&
    data.conversationTitle &&
    data.senderName !== data.conversationTitle
    ? `New message in ${data.conversationTitle}`
    : "New message";

const notifyBackgroundChatWindows = (
  windowClients: readonly WindowClientLike[],
  conversationId: string,
  conversationKey: string,
  message: StoredPushMessage,
) => {
  windowClients.forEach((client) => {
    if (parseUrlSafe(client.url)?.pathname !== "/chat") return;
    client.postMessage?.({
      type: "alice:push-message",
      conversationId,
      conversationKey,
      message,
    });
  });
};

const decryptPushPayloadMessage = async ({
  data,
  credentials,
  keyStore,
  windowClients,
  fetchLatestCiphertext,
}: {
  data: PushPayloadData;
  credentials: Credentials | null;
  keyStore: PushKeyStore;
  windowClients: readonly WindowClientLike[];
  fetchLatestCiphertext: typeof defaultFetchLatestCiphertext;
}) => {
  if (!credentials || !data.conversationId) return undefined;
  const symKey = await resolveConversationSymmetricKey({
    conversationId: data.conversationId,
    encryptedConversationKey: data.conversationKey,
    credentials,
    keyStore,
  });
  if (!symKey) return undefined;
  const rawCiphertext = data.encryptedMessage ??
    (await fetchLatestCiphertext({
      conversationId: data.conversationId,
      messageId: data.messageId,
      credentials,
    }));
  if (!isEncryptedMessage(rawCiphertext)) return undefined;
  const timestamp = data.timestamp ?? Date.now();
  if (data.messageId) {
    const storedMessage: StoredPushMessage = {
      id: data.messageId,
      payload: rawCiphertext,
      timestamp,
    };
    await keyStore.appendConversationMessage(
      data.conversationId,
      storedMessage,
    );
    notifyBackgroundChatWindows(
      windowClients,
      data.conversationId,
      symKey,
      storedMessage,
    );
  }
  return decryptMessagePayload(symKey, {
    conversationId: data.conversationId,
  })({
    payload: rawCiphertext,
    timestamp,
  });
};

export const handleServiceWorkerPush = async ({
  data,
  registration,
  clients,
  keyStore = defaultPushKeyStore,
  setAppBadge,
  clearAppBadge,
  fetchLatestCiphertext = defaultFetchLatestCiphertext,
  fetchFn = globalThis.fetch,
}: {
  data: PushPayloadData;
  registration: NotificationRegistrationLike;
  clients: ClientsLike;
  keyStore?: PushKeyStore;
  setAppBadge?: (count: number) => Promise<unknown>;
  clearAppBadge?: () => Promise<unknown>;
  fetchLatestCiphertext?: typeof defaultFetchLatestCiphertext;
  fetchFn?: typeof fetch;
}): Promise<void> => {
  const tag = data.conversationId || "alice-chat";
  const windowClients = await clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });

  if (data.type === "dismiss") {
    const anyFocused = windowClients.some(isWindowClientVisible);
    if (!anyFocused) {
      await registration
        .showNotification("Alice&Bot", {
          body: "",
          tag,
          silent: true,
          renotify: false,
          badge: notificationBadgePath,
        })
        .catch(() => {});
    }
    await closeMatchingNotifications(registration, tag);
    await syncAppBadgeFromNotifications({
      registration,
      setAppBadge,
      clearAppBadge,
    });
    return;
  }

  if (await resolveIsConversationFocused(windowClients, data.conversationId)) {
    await closeMatchingNotifications(registration, tag);
    await syncAppBadgeFromNotifications({
      registration,
      setAppBadge,
      clearAppBadge,
    });
    return;
  }

  const credentials = await keyStore.getCredentials();
  const decrypted = await decryptPushPayloadMessage({
    data,
    credentials,
    keyStore,
    windowClients,
    fetchLatestCiphertext,
  });

  if (decrypted && isSilentMessage(decrypted)) {
    return;
  }

  const preview = decrypted
    ? formatMessagePreview(decrypted)
    : fallbackPreviewBody(data);
  if (preview === null) return;

  const existing = await registration.getNotifications({ tag });
  const prevData = existing[0]?.data;
  const prevLines = readStoredLines(prevData);
  const prevCount = readStoredUnreadCount(prevData);
  const nextLine = formatLineForStack(data, preview);
  const isEdit = decrypted?.type === "edit" && nonempty(prevLines);
  const lines = isEdit
    ? [...prevLines.slice(0, -1), nextLine]
    : [...prevLines, nextLine].slice(-maxStackedLines);
  const unreadCount = isEdit ? prevCount : prevCount + 1;
  const baseTitle = resolveBaseTitle(data);
  const title = unreadCount > 1
    ? `${baseTitle} (${unreadCount} messages)`
    : baseTitle;

  const icon = await resolveSenderAvatarIcon({
    senderAvatar: data.senderAvatar,
    senderPublicSignKey: data.senderPublicSignKey,
    label: data.senderName || baseTitle,
    fetchFn,
  }).catch(() => defaultNotificationIconPath);

  await registration.showNotification(title, {
    body: lines.join("\n"),
    icon,
    badge: notificationBadgePath,
    tag,
    renotify: !isEdit,
    silent: isEdit,
    timestamp: data.timestamp ?? Date.now(),
    actions: defaultNotificationActions,
    data: {
      ...data,
      lines,
      unreadCount,
    },
  });

  await syncAppBadgeFromNotifications({
    registration,
    setAppBadge,
    clearAppBadge,
  });
};

const extractConversationIdFromData = (data: unknown): string | undefined =>
  isPlainObject(data) && typeof data.conversationId === "string"
    ? data.conversationId
    : undefined;

const extractConversationKeyFromData = (data: unknown): string | undefined =>
  isPlainObject(data) && typeof data.conversationKey === "string"
    ? data.conversationKey
    : undefined;

const focusOrOpenChatWindow = async (
  clients: ClientsLike,
  conversationId?: string,
) => {
  const targetUrl = conversationId
    ? `/chat?c=${encodeURIComponent(conversationId)}`
    : "/chat";
  const windowClients = await clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  const existingChatWindow = windowClients.find((w) => {
    const parsed = parseUrlSafe(w.url);
    return parsed?.pathname === "/chat";
  });
  if (existingChatWindow) {
    if (conversationId && existingChatWindow.postMessage) {
      existingChatWindow.postMessage({
        type: "alice:select-conversation",
        conversationId,
      });
    } else if (existingChatWindow.navigate) {
      await existingChatWindow.navigate(targetUrl);
    }
    await existingChatWindow.focus?.();
    return;
  }
  await clients.openWindow?.(targetUrl);
};

const dismissClickNotifications = async ({
  conversationId,
  registration,
  keyStore,
  setAppBadge,
  clearAppBadge,
  dismissRemoteFn,
}: {
  conversationId?: string;
  registration: NotificationRegistrationLike;
  keyStore: PushKeyStore;
  setAppBadge?: (count: number) => Promise<unknown>;
  clearAppBadge?: () => Promise<unknown>;
  dismissRemoteFn: typeof dismissNotificationsSigned;
}) => {
  if (conversationId) {
    await closeMatchingNotifications(registration, conversationId);
  }
  await syncAppBadgeFromNotifications({
    registration,
    setAppBadge,
    clearAppBadge,
  });
  const [credentials, pushEndpoint] = await Promise.all([
    keyStore.getCredentials(),
    keyStore.getPushEndpoint(),
  ]);
  if (credentials && conversationId) {
    dismissRemoteFn(credentials, {
      conversationId,
      ...(pushEndpoint ? { excludeEndpoint: pushEndpoint } : {}),
    }).catch(() => {});
  }
  return credentials;
};

export const handleServiceWorkerNotificationClick = async ({
  action,
  reply,
  notification,
  registration,
  clients,
  keyStore = defaultPushKeyStore,
  setAppBadge,
  clearAppBadge,
  sendReplyFn = sendMessageWithKey,
  dismissRemoteFn = dismissNotificationsSigned,
}: {
  action: string;
  reply?: string;
  notification: { tag?: string; data?: unknown; close: () => void };
  registration: NotificationRegistrationLike;
  clients: ClientsLike;
  keyStore?: PushKeyStore;
  setAppBadge?: (count: number) => Promise<unknown>;
  clearAppBadge?: () => Promise<unknown>;
  sendReplyFn?: typeof sendMessageWithKey;
  dismissRemoteFn?: typeof dismissNotificationsSigned;
}): Promise<void> => {
  notification.close();
  const conversationId = extractConversationIdFromData(notification.data);

  if (action !== "mark-read" && action !== "reply") {
    await Promise.all([
      focusOrOpenChatWindow(clients, conversationId),
      dismissClickNotifications({
        conversationId,
        registration,
        keyStore,
        setAppBadge,
        clearAppBadge,
        dismissRemoteFn,
      }),
    ]);
    return;
  }

  const credentials = await dismissClickNotifications({
    conversationId,
    registration,
    keyStore,
    setAppBadge,
    clearAppBadge,
    dismissRemoteFn,
  });

  if (action === "mark-read") {
    return;
  }

  const trimmedReply = reply?.trim() ?? "";
  if (trimmedReply && credentials && conversationId) {
    const symKey = await resolveConversationSymmetricKey({
      conversationId,
      encryptedConversationKey: extractConversationKeyFromData(
        notification.data,
      ),
      credentials,
      keyStore,
    });
    if (symKey) {
      await sendReplyFn({
        conversationKey: symKey,
        conversation: conversationId,
        credentials,
        message: { type: "text", text: trimmedReply },
      });
      return;
    }
  }

  await focusOrOpenChatWindow(clients, conversationId);
};
