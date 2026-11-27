import { html, nothing, render, type TemplateResult } from "lit";
import { ConnectedChat } from "../../lit/components/connected-chat.ts";
import {
  classifyGlobalShortcut,
  isMacPlatform,
  nextThreadId,
  shortcutHelpGroups,
} from "../../lit/components/shortcuts.ts";
import { retentionSummary } from "../../protocol/src/retention.ts";
import { buttonClass } from "./components.ts";
import {
  avatarColor,
  chatAvatar,
  shimmerCircle,
  shimmerText,
  spinner,
} from "./design-components.ts";
import {
  chatWithMeLink,
  checkCryptoPaymentSigned,
  createConversation,
  createIdentity,
  type Credentials,
  getBalanceAndTransactionsSigned,
  getProfile,
  prepareCryptoPaymentSigned,
  renameConversation,
  resolveHandle,
  setAlias,
  setName,
  setPriceTagSigned,
} from "../../protocol/src/clientApi.ts";
import {
  base64ToBase64Url,
  base64UrlToBase64,
  decryptSymmetric,
  type EncryptedSymmetric,
  encryptSymmetric,
  generateSymmetricKey,
} from "../../protocol/src/crypto.ts";
import {
  retrieveTransferPayload,
  storeTransferPayload,
} from "../../backend/src/api.ts";
import {
  closeLocalNotificationsForConversation,
  dismissConversationNotifications,
  registerPush,
  unregisterPush,
} from "../../protocol/src/pushClient.ts";
import {
  clearPushKeyStore,
  defaultPushKeyStore,
  savePushCredentials,
} from "../../protocol/src/pushKeyStore.ts";
import {
  isValidCredentials,
  shouldOverwriteCredentials,
} from "../../lit/core/credentials.ts";
import {
  canInstallPwa,
  isIosDevice,
  isStandaloneApp,
  subscribePwaInstall,
  triggerPwaInstall,
} from "./pwaInstall.ts";
import { copyToClipboard } from "../../lit/components/utils.ts";
import {
  inviteContextLabel,
  shareOrCopyInviteLink,
  type StarterAgent,
  starterAgents,
} from "./starter-agents.ts";
import {
  chatPath,
  homePath,
  mcpGuidePath,
  privacyPath,
  retentionPolicyPath,
  termsPath,
} from "./paths.ts";
import { currentQuery, navigate, onRouteLeave } from "./router.ts";
import { setActiveConversationGetter } from "./activeConversationBridge.ts";
import { subscribeDarkMode } from "../../lit/core/dark-mode.ts";
import { getCredentialsToCopy } from "../../lit/core/credentials.ts";
import { setDarkModeOverride } from "../../lit/core/dark-mode.ts";
import { registerCredentials } from "../../protocol/src/instantAuth.ts";
import {
  blurActiveInput,
  isTouchOnlyDevice,
  subscribeIsMobile,
} from "../../lit/core/responsive.ts";
import {
  accessAdminDb,
  accessDb,
  ensureInstantAuth,
  hintColdBootstrap,
} from "../../lit/core/instant-client.ts";
import { tx } from "@instantdb/core";
import {
  type Conversation,
  isConversationArchived,
  isConversationPinned,
  sortConversations,
  subscribeConversations,
  subscribeIdentityProfile,
  subscribeUserName,
} from "../../lit/core/subscriptions.ts";
import {
  activeTypingNamesForConversation,
  type ConversationPreviewMap,
  conversationPreviewsCacheKey,
  type ConversationPreviewsManager,
  type ConversationTypingMap,
  createConversationPreviewsManager,
  formatConversationPreviewLine,
  formatConversationTime,
  formatConversationTypingLabel,
  subscribeAllTypingStates,
} from "../../lit/core/conversation-previews.ts";
import {
  computeConversationUnread,
  formatDocumentTitle,
  formatUnreadBadgeLabel,
  latestKnownConversationTimestamp,
  markConversationRead,
  markConversationUnread,
  readUnreadState,
  seedUnreadState,
  type StoredUnreadState,
  subscribeUnreadStateStorage,
  summarizeUnreadCounts,
  syncFaviconDot,
  syncNavigatorAppBadge,
  unreadStateStorageKey,
  writeUnreadState,
} from "../../lit/core/unread-state.ts";

// --- Styles ---

const textColorStyle = "text-[#181715] dark:text-[#f3f1ea]";
const sectionSpacing = "mb-5";
const labelStyle =
  "block mb-2 text-sm font-medium text-[#181715] dark:text-[#e7e5df]";
const labelSmallStyle = "block text-xs text-[#66625b] dark:text-[#9c968c]";
const inputRowStyle = "flex gap-2 mb-2";
const inputStyle =
  "border px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#191815] border-[#dcd8cc] dark:border-[#2e2d28] text-[#181715] dark:text-[#f3f1ea] placeholder-[#8c867c] focus:outline-none focus:ring-2 focus:ring-[#39587f]/35 focus:border-[#39587f] dark:focus:border-[#6b93c4] transition-colors max-w-md";
const settingsCardClass =
  "bg-white dark:bg-[#151513] border border-[#e7e4dc] dark:border-[#252420] rounded-2xl p-5 space-y-4";
const hintStyle = "text-xs text-[#78736a] dark:text-[#8c867c] mt-1";
const storeCredentialsLabel = "Remember on this device";

// --- Module-level reactive state ---

let currentDark = false;
let currentIsMobile = false;
let chatInitialized = false;

subscribeDarkMode((d) => {
  currentDark = d;
  if (chatInitialized) rerenderChat();
});
subscribeIsMobile((m) => {
  currentIsMobile = m;
  if (chatInitialized) rerenderChat();
});
subscribePwaInstall(() => {
  if (chatInitialized) rerenderChat();
});

type View = "chats" | "new_chat" | "identity";

let credentials: Credentials | null = null;
let credentialsChecked = false;
let selectedConversation: string | null = null;
let view: View = "chats";
let conversations: Conversation[] | null = null;
let conversationPreviews: ConversationPreviewMap = {};
let typingByConversation: ConversationTypingMap = {};
let unreadState: StoredUnreadState | null = null;
let openChatUnreadBanner:
  | { conversationId: string; readAtBeforeOpen: number }
  | null = null;
let searchQuery = "";
let initializedFromQuery = false;
let handledChatWith: string | null = null;
let chatWithInFlight = false;
let transferImportInFlight = false;

let chatContainer: HTMLElement | null = null;
let viewportCleanup: (() => void) | null = null;
let overflowCleanup: (() => void) | null = null;
let conversationsUnsub: (() => void) | null = null;
let previewsManager: ConversationPreviewsManager | null = null;
let allTypingUnsub: (() => void) | null = null;
let unreadStorageUnsub: (() => void) | null = null;

const chatRouteBaseTitle = "Messenger - Alice&Bot";

const conversationsCacheKey = "alicebot_conversations_cache";

const readCachedConversations = (
  publicSignKey: string,
): Conversation[] | null => {
  try {
    const raw = globalThis.localStorage?.getItem(conversationsCacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      parsed.publicSignKey === publicSignKey &&
      Array.isArray(parsed.conversations)
    ) {
      return parsed.conversations;
    }
  } catch {
    // ignore corrupted cache
  }
  return null;
};

const writeCachedConversations = (
  publicSignKey: string,
  convs: Conversation[] | null,
) => {
  if (!convs) return;
  try {
    if (!globalThis.localStorage?.getItem("alicebot_credentials")) return;
    globalThis.localStorage.setItem(
      conversationsCacheKey,
      JSON.stringify({ publicSignKey, conversations: convs }),
    );
  } catch {
    // ignore quota errors
  }
};

// Sub-component mutable state
let loginShowForm: null | "existing" = null;
let loginDisplayName = "";
let loginCreatingIdentity = false;
let loginStoreInBrowser = true;
let loginExistingInput = "";
let loginIsScanningQr = false;
let qrScanVideoElement: HTMLVideoElement | null = null;
let qrScanStream: MediaStream | null = null;
let qrScanAnimationId: number | null = null;

let newChatInput = "";

let showArchived = false;

let renameModalConvId: string | null = null;
let renameModalInput = "";
let renameModalSaving = false;
let shortcutsModalOpen = false;
let searchHighlightIndex = 0;
let searchInputFocused = false;

// Touch/Swipe state for conversation list items on mobile
let activeSwipeConvId: string | null = null;
let activeSwipeOffset = 0;
let touchStartX = 0;
let touchStartY = 0;
let swipeDirectionLocked: "x" | "y" | null = null;
let wasSwiping = false;
let wasSwipingTimeout: number | null = null;

const handleTouchStart = (e: TouchEvent, convId: string) => {
  if (e.touches.length === 0) return;
  if (wasSwipingTimeout) clearTimeout(wasSwipingTimeout);
  wasSwiping = false;
  const touch = e.touches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
  activeSwipeConvId = convId;
  activeSwipeOffset = 0;
  swipeDirectionLocked = null;
};

const handleTouchMove = (e: TouchEvent, convId: string) => {
  if (
    activeSwipeConvId !== convId || touchStartX === 0 || e.touches.length === 0
  ) return;
  const touch = e.touches[0];
  const dx = touch.clientX - touchStartX;
  const dy = touch.clientY - touchStartY;

  if (swipeDirectionLocked === null) {
    if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      swipeDirectionLocked = "x";
    } else if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
      swipeDirectionLocked = "y";
    }
  }

  if (swipeDirectionLocked === "x") {
    if (e.cancelable) {
      e.preventDefault();
    }
    wasSwiping = true;
    const conv = conversations?.find((c) => c.id === convId);
    const canSwipePin = conv ? !isArchived(conv) : false;
    activeSwipeOffset = dx < 0 ? dx : canSwipePin ? dx : dx * 0.1;
    rerenderChat();
  }
};

const handleTouchEnd = (_e: TouchEvent, convId: string) => {
  if (activeSwipeConvId !== convId) return;

  const threshold = 80;
  if (swipeDirectionLocked === "x" && activeSwipeOffset < -threshold) {
    const conv = conversations?.find((c) => c.id === convId);
    const isCurrentlyArchived = conv ? isArchived(conv) : false;
    if (isCurrentlyArchived) {
      unarchiveConversation(convId);
      showToast("Chat unarchived", "success");
    } else {
      archiveConversation(convId);
      showToast("Chat archived", "success");
    }
  } else if (swipeDirectionLocked === "x" && activeSwipeOffset > threshold) {
    const conv = conversations?.find((c) => c.id === convId);
    if (conv && !isArchived(conv)) {
      if (isPinned(conv)) {
        unpinConversation(convId);
        showToast("Chat unpinned", "success");
      } else {
        pinConversation(convId);
        showToast("Chat pinned", "success");
      }
    }
  }

  if (wasSwiping) {
    wasSwipingTimeout = setTimeout(() => {
      wasSwiping = false;
    }, 100) as unknown as number;
  }

  activeSwipeConvId = null;
  activeSwipeOffset = 0;
  touchStartX = 0;
  touchStartY = 0;
  swipeDirectionLocked = null;
  rerenderChat();
};

const isArchived = isConversationArchived;
const isPinned = isConversationPinned;

const archiveConversation = (conversationId: string) => {
  const profileId = yourKeyProfile?.id;
  if (!profileId) return;
  const creds = credentials ?? undefined;
  const conv = conversations?.find((c) => c.id === conversationId);
  const wasPinned = conv ? isPinned(conv) : false;
  if (conversations && creds) {
    conversations = conversations.map((c) =>
      c.id === conversationId
        ? {
          ...c,
          archivedBy: [{ publicSignKey: creds.publicSignKey }],
          pinnedBy: [],
        }
        : c
    );
    writeCachedConversations(creds.publicSignKey, conversations);
  }
  ensureInstantAuth(creds).then(() =>
    accessDb().transact([
      tx.identities[profileId].link({
        archivedConversations: conversationId,
      }),
      ...(wasPinned
        ? [
          tx.identities[profileId].unlink({
            pinnedConversations: conversationId,
          }),
        ]
        : []),
    ])
  ).catch((error) => {
    console.error("Failed to archive conversation:", error);
  });
  if (selectedConversation === conversationId) {
    selectedConversation = null;
  }
  syncPreviewTargets();
  rerenderChat();
};

const unarchiveConversation = (conversationId: string) => {
  const profileId = yourKeyProfile?.id;
  if (!profileId) return;
  const creds = credentials ?? undefined;
  if (conversations && creds) {
    conversations = sortConversations(
      conversations.map((c) =>
        c.id === conversationId ? { ...c, archivedBy: [] } : c
      ),
    );
    writeCachedConversations(creds.publicSignKey, conversations);
  }
  ensureInstantAuth(creds).then(() =>
    accessDb().transact(
      tx.identities[profileId].unlink({
        archivedConversations: conversationId,
      }),
    )
  ).catch((error) => {
    console.error("Failed to unarchive conversation:", error);
  });
  syncPreviewTargets();
  rerenderChat();
};

const pinConversation = (conversationId: string) => {
  const profileId = yourKeyProfile?.id;
  const creds = credentials;
  if (!profileId || !creds) return;
  const prevConversations = conversations;
  if (conversations) {
    conversations = sortConversations(
      conversations.map((c) =>
        c.id === conversationId
          ? { ...c, pinnedBy: [{ publicSignKey: creds.publicSignKey }] }
          : c
      ),
    );
    writeCachedConversations(creds.publicSignKey, conversations);
  }
  syncPreviewTargets();
  rerenderChat();
  ensureInstantAuth(creds)
    .then(() =>
      accessDb().transact(
        tx.identities[profileId].link({
          pinnedConversations: conversationId,
        }),
      )
    )
    .catch((error) => {
      console.error("Failed to pin conversation:", error);
      conversations = prevConversations;
      syncPreviewTargets();
      showToast("Failed to pin chat", "error");
      rerenderChat();
    });
};

const unpinConversation = (conversationId: string) => {
  const profileId = yourKeyProfile?.id;
  const creds = credentials;
  if (!profileId || !creds) return;
  const prevConversations = conversations;
  if (conversations) {
    conversations = sortConversations(
      conversations.map((c) =>
        c.id === conversationId ? { ...c, pinnedBy: [] } : c
      ),
    );
    writeCachedConversations(creds.publicSignKey, conversations);
  }
  syncPreviewTargets();
  rerenderChat();
  ensureInstantAuth(creds)
    .then(() =>
      accessDb().transact(
        tx.identities[profileId].unlink({
          pinnedConversations: conversationId,
        }),
      )
    )
    .catch((error) => {
      console.error("Failed to unpin conversation:", error);
      conversations = prevConversations;
      syncPreviewTargets();
      showToast("Failed to unpin chat", "error");
      rerenderChat();
    });
};

// Name cache for conversation list items
const nameCache = new Map<string, string | null>();
const nameUnsubs = new Map<string, () => void>();

const subscribeName = (publicSignKey: string) => {
  if (nameUnsubs.has(publicSignKey)) return;
  const unsub = subscribeUserName(publicSignKey, (name) => {
    nameCache.set(publicSignKey, name);
    rerenderChat();
  });
  nameUnsubs.set(publicSignKey, unsub);
};

// Profile cache for YourKey section
let yourKeyProfile: {
  id?: string;
  name?: string;
  avatar?: string;
  alias?: string;
  priceTag?: number;
} | null = null;
let yourKeyProfileUnsub: (() => void) | null = null;
let yourKeyNameInput = "";
let yourKeyAliasInput = "";
let yourKeySavingName = false;
let yourKeySavingAlias = false;
let yourKeyNameStatus: { type: "success" | "error"; message: string } | null =
  null;
let yourKeyAliasStatus: { type: "success" | "error"; message: string } | null =
  null;
let yourKeyPriceTagInput = "0";
let yourKeySavingPrice = false;
let yourKeyPriceStatus: { type: "success" | "error"; message: string } | null =
  null;
let yourKeyBalanceData: {
  balance: number;
  transactions: unknown[];
} | null = null;
let yourKeyDepositData: {
  address: string;
  btcAmount: number;
  usdAmount: number;
  qrUrl: string;
} | null = null;
let yourKeyDepositInterval: number | null = null;
let paidInboxOpen = false;
let dangerZoneOpen = false;
let copiedCredentials = false;
let copiedPublicKey = false;
let qrDataUrl: string | null = null;
let qrTransferUrl: string | null = null;
let qrLoading = false;
let qrError: string | null = null;
let qrCopied = false;

// --- Toast ---

const showToast = (
  message: string,
  variant: "default" | "success" | "error" = "default",
) => {
  const bg = variant === "error"
    ? "#dc2626"
    : variant === "success"
    ? "#39587f"
    : "#181715";
  const el = Object.assign(document.createElement("div"), {
    textContent: message,
    style:
      `position:fixed;top:16px;left:50%;transform:translateX(-50%);background:${bg};color:#fff;padding:8px 20px;border-radius:999px;z-index:9999;font-size:13px;font-weight:500;box-shadow:0 6px 20px rgba(0,0,0,0.18);transition:opacity 0.3s`,
  });
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 300);
  }, 2000);
};

const toastPromise = <T>(
  promise: Promise<T>,
  msgs: {
    loading: string;
    success: string;
    error: string | ((e: unknown) => string);
  },
): Promise<T> => {
  showToast(msgs.loading);
  return promise.then(
    (v) => {
      showToast(msgs.success, "success");
      return v;
    },
    (e) => {
      showToast(
        typeof msgs.error === "function" ? msgs.error(e) : msgs.error,
        "error",
      );
      throw e;
    },
  );
};

// --- DB ---

const nameFromPublicSignKey = async (publicSignKey: string) => {
  const { data } = await accessDb().queryOnce({
    identities: { $: { where: { publicSignKey } } },
  });
  if (data.identities.length === 0) {
    console.error(`No identity found for public sign key: ${publicSignKey}`);
    return publicSignKey;
  }
  return data.identities[0].name ?? publicSignKey;
};

// --- Viewport height ---

const setViewportHeightVar = () => {
  if (typeof document === "undefined") return;
  const viewport = globalThis.visualViewport;
  const height = viewport
    ? Math.min(viewport.height, globalThis.innerHeight) -
      (viewport.offsetTop ?? 0)
    : globalThis.innerHeight;
  const h = `${Math.max(height, 320)}px`;
  const root = document.getElementById("root");
  const targets = [document.documentElement, document.body, root].filter(
    Boolean,
  ) as HTMLElement[];
  targets.forEach((el) => {
    el.style.setProperty("--app-height", h);
    el.style.height = h;
    el.style.maxHeight = h;
    el.style.minHeight = h;
    el.style.overflow = "hidden";
  });
};

const initViewportHeightListener = () => {
  if (typeof document === "undefined") return () => {};
  const root = document.getElementById("root");
  const targets = [document.documentElement, document.body, root].filter(
    Boolean,
  ) as HTMLElement[];
  const originalStyles = targets.map((el) => ({
    height: el.style.height,
    maxHeight: el.style.maxHeight,
    minHeight: el.style.minHeight,
    overflow: el.style.overflow,
    appHeight: el.style.getPropertyValue("--app-height"),
  }));
  const handler = () => setViewportHeightVar();
  setViewportHeightVar();
  const vp = globalThis.visualViewport;
  vp?.addEventListener("resize", handler);
  vp?.addEventListener("scroll", handler);
  globalThis.addEventListener("resize", handler);
  globalThis.addEventListener("orientationchange", handler);
  return () => {
    vp?.removeEventListener("resize", handler);
    vp?.removeEventListener("scroll", handler);
    globalThis.removeEventListener("resize", handler);
    globalThis.removeEventListener("orientationchange", handler);
    targets.forEach((el, i) => {
      const orig = originalStyles[i];
      el.style.height = orig.height;
      el.style.maxHeight = orig.maxHeight;
      el.style.minHeight = orig.minHeight;
      el.style.overflow = orig.overflow;
      if (orig.appHeight) el.style.setProperty("--app-height", orig.appHeight);
      else el.style.removeProperty("--app-height");
    });
  };
};

// --- Overflow lock ---

const lockOverflow = () => {
  if (typeof document === "undefined") return () => {};
  const { body, documentElement } = document;
  const prevBodyOverflow = body.style.overflow;
  const prevBodyOverscroll = body.style.overscrollBehaviorY;
  const prevHtmlOverflow = documentElement.style.overflow;
  body.style.overflow = "hidden";
  body.style.overscrollBehaviorY = "contain";
  documentElement.style.overflow = "hidden";
  return () => {
    body.style.overflow = prevBodyOverflow;
    body.style.overscrollBehaviorY = prevBodyOverscroll;
    documentElement.style.overflow = prevHtmlOverflow;
  };
};

// --- Conversation logic ---

const isMatch =
  (myKey: string, chatWithKey: string, topic?: string) =>
  ({ participants, title }: Conversation) => {
    const keys = participants.map(({ publicSignKey }) => publicSignKey);
    const keysMatch = keys.length === 2 && keys.includes(myKey) &&
      keys.includes(chatWithKey);
    if (!keysMatch) return false;
    if (topic) return title === topic;
    return true;
  };

const startConversation = async (
  creds: Credentials,
  rawInput: string,
  topic?: string,
): Promise<string | null> => {
  const tokens = rawInput.split(",").map((t) => t.trim().replace(/^@/, ""))
    .filter(Boolean);
  if (tokens.length === 0) {
    showToast("Enter at least one @alias or public key", "error");
    return null;
  }
  const resolved = await Promise.all(tokens.map(async (token) => {
    try {
      const res = await resolveHandle(token);
      if ("publicSignKey" in res) return res.publicSignKey;
    } catch (_) {
      // network / other errors fall through
    }
    return token;
  }));
  const participantKeys = Array.from(
    new Set([
      creds.publicSignKey,
      ...resolved.filter((k) => k !== creds.publicSignKey),
    ]),
  );
  if (participantKeys.length < 2) {
    showToast("Need at least one other participant", "error");
    return null;
  }
  const names = await Promise.all(
    participantKeys.map((k) => nameFromPublicSignKey(k)),
  );
  const title = topic || names.join(", ");

  let totalCost = 0;
  for (const key of participantKeys) {
    if (key === creds.publicSignKey) continue;
    const { profile } = await getProfile(key);
    if (profile?.priceTag) totalCost += profile.priceTag;
  }
  if (totalCost > 0) {
    const costInDollars = (totalCost / 100).toFixed(2);
    if (
      !globalThis.confirm(`This outreach will cost ${costInDollars}. Proceed?`)
    ) return null;
  }

  const response = await toastPromise(
    (async () => {
      const res = await createConversation(accessAdminDb)(
        participantKeys,
        title,
        creds,
        totalCost,
      );
      if ("error" in res) throw new Error(res.error);
      return res;
    })(),
    {
      loading: "Creating conversation\u2026",
      success: "Conversation created",
      error: (e) =>
        `Failed to create conversation: ${(e as Error)?.message ?? "error"}`,
    },
  );
  selectedConversation = response.conversationId;
  return response.conversationId;
};

// --- Transfer ---

const parseTransferFragment = (hash: string) => {
  const decoded = decodeURIComponent(hash);
  const match = decoded.match(/^#?transfer=([^:]+):(.+)$/);
  if (!match) return null;
  return { relayId: match[1], aesKey: base64UrlToBase64(match[2]) };
};

const handleTransferImport = async () => {
  if (typeof globalThis.location === "undefined") return;
  if (globalThis.document) {
    const state: unknown = globalThis.document.visibilityState;
    if (state === "prerender") {
      const onVisibilityChange = () => {
        const currentState: unknown = globalThis.document.visibilityState;
        if (currentState !== "prerender") {
          globalThis.document.removeEventListener(
            "visibilitychange",
            onVisibilityChange,
          );
          handleTransferImport();
        }
      };
      globalThis.document.addEventListener(
        "visibilitychange",
        onVisibilityChange,
      );
      return;
    }
  }
  const parsed = parseTransferFragment(globalThis.location.hash);
  if (!parsed) return;
  if (transferImportInFlight) return;
  transferImportInFlight = true;
  globalThis.location.hash = "";
  try {
    let result = await retrieveTransferPayload(parsed.relayId);
    if ("error" in result) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      result = await retrieveTransferPayload(parsed.relayId);
    }
    if ("error" in result) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      result = await retrieveTransferPayload(parsed.relayId);
    }
    if ("error" in result) {
      showToast("Transfer link expired or already used", "error");
      transferImportInFlight = false;
      credentialsChecked = true;
      rerenderChat();
      return;
    }
    const creds = await decryptSymmetric<unknown>(
      parsed.aesKey,
      result.encryptedPayload as EncryptedSymmetric<unknown>,
    );
    if (!isValidCredentials(creds)) {
      throw new Error("Invalid transfer credentials");
    }
    const existingStored = localStorage.getItem("alicebot_credentials");
    if (!shouldOverwriteCredentials(existingStored)) {
      transferImportInFlight = false;
      credentialsChecked = true;
      showToast("Identity import cancelled");
      rerenderChat();
      return;
    }
    localStorage.setItem("alicebot_credentials", JSON.stringify(creds));
    transferImportInFlight = false;
    credentialsChecked = true;
    setCredentials_(creds);
    syncStateFromUrl();
    showToast("Credentials imported", "success");
  } catch (e) {
    console.error("Error importing transfer credentials", e);
    showToast("Failed to import credentials", "error");
    transferImportInFlight = false;
    credentialsChecked = true;
    rerenderChat();
  }
};

const generateTransferUrl = async (creds: Credentials) => {
  const aesKey = await generateSymmetricKey();
  const encrypted = await encryptSymmetric(aesKey, creds);
  const { relayId } = await storeTransferPayload(encrypted);
  const fragment = `transfer=${relayId}:${base64ToBase64Url(aesKey)}`;
  return `https://aliceandbot.com${chatPath}#${fragment}`;
};

const generateTransferQr = async (url: string) => {
  const QRCode = (await import("qrcode")).default;
  return QRCode.toDataURL(url, { width: 256, margin: 2 });
};

// --- Active reporting ---

// --- URL sync ---

const syncUrlFromState = () => {
  if (!credentials) return;
  if (!initializedFromQuery) return;
  const params = new URLSearchParams(globalThis.location.search);
  params.delete("chatWith");
  params.delete("topic");
  if (view === "identity") {
    params.set("view", "identity");
    params.delete("c");
  } else if (view === "new_chat") {
    params.set("view", "new_chat");
    params.delete("c");
  } else {
    params.delete("view");
    if (selectedConversation) params.set("c", selectedConversation);
    else params.delete("c");
  }
  const newUrl = `${chatPath}${
    params.toString() ? `?${params.toString()}` : ""
  }`;
  const currentUrl =
    `${globalThis.location.pathname}${globalThis.location.search}`;
  if (currentUrl !== newUrl) navigate(newUrl, true);
};

const syncStateFromUrl = () => {
  if (!credentials) return;
  const q = currentQuery();
  if (q["chatWith"]) return;
  const v = q["view"] as View | undefined;
  const c = q["c"] as string | undefined;
  if (v === "identity" || v === "new_chat") {
    if (selectedConversation !== null) selectedConversation = null;
    if (view !== v) view = v;
    if (v === "identity" && !yourKeyBalanceData) fetchBalance();
    if (!initializedFromQuery) initializedFromQuery = true;
    rerenderChat();
    return;
  }
  if (c) {
    if (view !== "chats") view = "chats";
    if (selectedConversation !== c) {
      openChatUnreadBanner = null;
      selectedConversation = c;
    }
    acknowledgeActiveConversation(true);
  } else {
    if (view !== "chats") view = "chats";
    if (selectedConversation !== null) {
      openChatUnreadBanner = null;
      selectedConversation = null;
    }
  }
  if (!initializedFromQuery) initializedFromQuery = true;
  rerenderChat();
};

const handleChatWithInvite = async () => {
  if (!credentials || conversations === null) return;
  const q = currentQuery();
  const cw = q["chatWith"];
  const topic = q["topic"];
  if (!cw) return;
  const handledKey = topic ? `${cw}-${topic}` : cw;
  if (handledChatWith === handledKey) return;
  if (chatWithInFlight) return;
  chatWithInFlight = true;

  let resolvedKey = cw;
  try {
    const res = await resolveHandle(cw);
    if ("publicSignKey" in res) resolvedKey = res.publicSignKey;
  } catch (_) {
    // assume it's already a public sign key
  }

  const existing = (conversations ?? []).find(
    isMatch(credentials.publicSignKey, resolvedKey, topic),
  );
  let conversationId: string | null = null;
  if (existing) {
    selectedConversation = existing.id;
    conversationId = existing.id;
  } else {
    try {
      conversationId = await startConversation(credentials, cw, topic);
    } catch (e) {
      console.error("Failed to start conversation invite", e);
    }
  }
  if (!conversationId) {
    chatWithInFlight = false;
    return;
  }
  const params = new URLSearchParams(globalThis.location.search);
  params.delete("chatWith");
  params.delete("topic");
  params.delete("login");
  params.delete("view");
  params.set("c", conversationId);
  navigate(`${chatPath}?${params.toString()}`, true);
  handledChatWith = handledKey;
  chatWithInFlight = false;
  rerenderChat();
};

// --- popstate handler ---

const onPopstate = () => {
  syncStateFromUrl();
  rerenderChat();
};

// --- YourKey profile subscription ---

const subscribeYourKeyProfile = (publicSignKey: string) => {
  if (yourKeyProfileUnsub) yourKeyProfileUnsub();
  yourKeyProfileUnsub = subscribeIdentityProfile(publicSignKey, (profile) => {
    yourKeyProfile = profile;
    if (profile?.priceTag !== undefined) {
      yourKeyPriceTagInput = profile.priceTag
        ? (profile.priceTag / 100).toString()
        : "0";
    }
    if (profile?.alias !== undefined && yourKeyAliasInput === "") {
      yourKeyAliasInput = profile.alias ?? "";
    }
    const shortName = profile?.name?.split("@")[0] ?? null;
    if (shortName !== null && yourKeyNameInput === "") {
      yourKeyNameInput = shortName;
    }
    rerenderChat();
  });
};

const fetchBalance = () => {
  if (!credentials) return;
  getBalanceAndTransactionsSigned(credentials)
    .then((res) => {
      if (!("error" in res)) {
        yourKeyBalanceData = res;
        rerenderChat();
      }
    })
    .catch(() => {});
};

const maxDepositPollDurationMs = 15 * 60 * 1000;

const startDepositPolling = () => {
  stopDepositPolling();
  if (!yourKeyDepositData || !credentials) return;
  const creds = credentials;
  const address = yourKeyDepositData.address;
  const startedAt = Date.now();
  yourKeyDepositInterval = setInterval(() => {
    if (Date.now() - startedAt >= maxDepositPollDurationMs) {
      stopDepositPolling();
      return;
    }
    if (globalThis.document?.hidden) return;
    checkCryptoPaymentSigned({
      paymentAddress: address,
      credentials: creds,
    })
      .then((res) => {
        if (!("error" in res)) {
          showToast(res.message, "success");
          yourKeyDepositData = null;
          stopDepositPolling();
          fetchBalance();
          rerenderChat();
        }
      })
      .catch(() => {});
  }, 10000) as unknown as number;
};

const stopDepositPolling = () => {
  if (yourKeyDepositInterval !== null) {
    clearInterval(yourKeyDepositInterval);
    yourKeyDepositInterval = null;
  }
};

// --- Rerender ---

const mountChatPanels = () => {
  const desktopPanel = document.getElementById("desktop-chat-panel");
  const mobilePanel = document.getElementById("mobile-chat-panel");
  if (desktopPanel) renderChatPanel(desktopPanel);
  if (mobilePanel) renderChatPanel(mobilePanel);
};

const isConversationVisiblyOpen = (conversationId: string): boolean =>
  view === "chats" &&
  selectedConversation === conversationId &&
  globalThis.document?.visibilityState !== "hidden";

const ensureUnreadState = (): StoredUnreadState | null => {
  if (!credentials) return null;
  if (unreadState && unreadState.publicSignKey === credentials.publicSignKey) {
    return unreadState;
  }
  if (conversations === null) return null;
  const seeded = seedUnreadState(
    unreadState,
    credentials.publicSignKey,
    conversations,
  );
  unreadState = seeded;
  writeUnreadState(seeded);
  return seeded;
};

const unreadStatusFor = (conv: Conversation) =>
  computeConversationUnread({
    conversationId: conv.id,
    preview: conversationPreviews[conv.id],
    selfPublicSignKey: credentials?.publicSignKey ?? "",
    state: unreadState,
    isActivelyViewing: isConversationVisiblyOpen(conv.id),
  });

const unreadSummary = () =>
  summarizeUnreadCounts(conversations, unreadStatusFor, isArchived);

const syncBrowserUnreadIndicators = () => {
  if (!credentials) {
    syncFaviconDot(false);
    return;
  }
  const summary = unreadSummary();
  if (typeof document !== "undefined") {
    document.title = formatDocumentTitle(
      chatRouteBaseTitle,
      summary.activeUnreadChats,
    );
  }
  syncFaviconDot(summary.activeUnreadChats > 0);
  syncNavigatorAppBadge(summary.activeUnreadMessages);
};

const markConversationAsRead = (
  conversationId: string,
  explicitTimestamp?: number,
) => {
  const current = ensureUnreadState();
  if (!current) return;
  const conv = conversations?.find((c) => c.id === conversationId);
  const preview = conversationPreviews[conversationId];
  const readTs = Math.max(
    explicitTimestamp ?? 0,
    latestKnownConversationTimestamp(conv, preview),
  );
  const next = markConversationRead(current, conversationId, readTs);
  if (next === current) return;
  unreadState = next;
  writeUnreadState(next);
  syncBrowserUnreadIndicators();
};

const markConversationAsUnread = (conversationId: string) => {
  const current = ensureUnreadState();
  if (!current) return;
  const next = markConversationUnread(current, conversationId);
  if (next === current) return;
  unreadState = next;
  writeUnreadState(next);
  if (openChatUnreadBanner?.conversationId === conversationId) {
    openChatUnreadBanner = null;
  }
  rerenderChat();
};

const rerenderChat = () => {
  if (!chatContainer?.isConnected) return;
  render(chatTemplate(), chatContainer);
  mountChatPanels();
  syncBrowserUnreadIndicators();
};

// --- Chevron SVG ---

const chevron = (up: boolean) =>
  html`
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      style="${up ? "transform:rotate(180deg)" : ""}"
    >
      <path d="M2 4l4 4 4-4" />
    </svg>
  `;

// --- Logo ---

const logoTemplate = (onClick?: () => void) => {
  const content = html`
    <div class="flex items-center gap-2">
      <img src="/icon-alice.png" alt="Alice&Bot" class="w-8 h-8 object-contain" />
      <span
        class="text-base font-bold tracking-tight text-[#181715] dark:text-[#f3f1ea]"
      >Alice&Bot</span>
    </div>
  `;
  return onClick
    ? html`
      <button
        type="button"
        @click="${onClick}"
        class="hover:opacity-80 transition-opacity cursor-pointer"
      >
        ${content}
      </button>
    `
    : content;
};

// --- Icons ---

const chatIcon = html`
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
`;
const settingsIcon = html`
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <circle cx="12" cy="12" r="3" />
    <path
      d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
    />
  </svg>
`;
const newChatIcon = html`
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path
      d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 8.5-8.5 8.38 8.38 0 0 1 3.8.9"
    />
    <line x1="12" y1="9" x2="12" y2="15" />
    <line x1="9" y1="12" x2="15" y2="12" />
  </svg>
`;
const sunSvg = html`
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
`;
const moonSvg = html`
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
`;
const keyboardSvg = html`
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
    <path
      d="M6 8h.001M10 8h.001M14 8h.001M18 8h.001M8 12h.001M12 12h.001M16 12h.001M7 16h10" />
  </svg>
`;

const archiveSvg = html`
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    stroke-width="2"
    stroke="currentColor"
    class="w-4 h-4"
  >
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
    />
  </svg>
`;

const unarchiveSvg = html`
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    stroke-width="2"
    stroke="currentColor"
    class="w-4 h-4"
  >
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15M9 12l3-3m0 0l3 3m-3-3V15"
    />
  </svg>
`;

const renameSvg = html`
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    stroke-width="2"
    stroke="currentColor"
    class="w-4 h-4"
  >
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125"
    />
  </svg>
`;

const markUnreadSvg = html`
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    stroke-width="2"
    stroke="currentColor"
    class="w-4 h-4"
  >
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
    />
  </svg>
`;

const markReadSvg = html`
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    stroke-width="2"
    stroke="currentColor"
    class="w-4 h-4"
  >
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      d="M21.75 9v.906a2.25 2.25 0 0 1-1.183 1.981l-6.478 3.488M2.25 9v.906a2.25 2.25 0 0 0 1.183 1.981l6.478 3.488m8.839 2.51-4.66-2.51m0 0-1.023-.55a2.25 2.25 0 0 0-2.134 0l-1.022.55m0 0-4.661 2.51m16.5 1.615a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V8.844a2.25 2.25 0 0 1 1.183-1.981l7.5-4.039a2.25 2.25 0 0 1 2.134 0l7.5 4.039a2.25 2.25 0 0 1 1.183 1.98V19.5Z"
    />
  </svg>
`;

const pinSvg = html`
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    stroke-width="2"
    stroke="currentColor"
    class="w-4 h-4"
  >
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"
    />
  </svg>
`;

const unpinSvg = html`
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    class="w-4 h-4"
  >
    <path
      d="M16 3a1 1 0 0 1 .707.293l4 4a1 1 0 0 1-.141 1.53l-2.34 1.56-.97 4.854a1 1 0 0 1-1.688.51l-2.861-2.861-4.5 4.5a1 1 0 0 1-1.414-1.414l4.5-4.5-2.86-2.861a1 1 0 0 1 .509-1.688l4.854-.97 1.56-2.34A1 1 0 0 1 16 3Z"
    />
  </svg>
`;

const pinnedIndicatorSvg = html`
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    class="w-3.5 h-3.5"
    aria-hidden="true"
  >
    <path
      d="M16 3a1 1 0 0 1 .707.293l4 4a1 1 0 0 1-.141 1.53l-2.34 1.56-.97 4.854a1 1 0 0 1-1.688.51l-2.861-2.861-4.5 4.5a1 1 0 0 1-1.414-1.414l4.5-4.5-2.86-2.861a1 1 0 0 1 .509-1.688l4.854-.97 1.56-2.34A1 1 0 0 1 16 3Z"
    />
  </svg>
`;

const swipePinSvg = html`
  <svg
    class="w-5 h-5"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path
      d="M16 3a1 1 0 0 1 .707.293l4 4a1 1 0 0 1-.141 1.53l-2.34 1.56-.97 4.854a1 1 0 0 1-1.688.51l-2.861-2.861-4.5 4.5a1 1 0 0 1-1.414-1.414l4.5-4.5-2.86-2.861a1 1 0 0 1 .509-1.688l4.854-.97 1.56-2.34A1 1 0 0 1 16 3Z"
    />
  </svg>
`;

const openRenameModal = (convId: string, currentTitle: string) => {
  renameModalConvId = convId;
  renameModalInput = currentTitle;
  renameModalSaving = false;
  rerenderChat();
  requestAnimationFrame(() => {
    const input = document.getElementById(
      "landing-rename-input",
    ) as HTMLInputElement | null;
    input?.focus();
    input?.select();
  });
};

const closeRenameModal = () => {
  renameModalConvId = null;
  renameModalSaving = false;
  rerenderChat();
};

const submitRenameModal = async () => {
  const trimmed = renameModalInput.trim();
  const convId = renameModalConvId;
  if (!trimmed || !convId || !credentials || renameModalSaving) return;
  renameModalSaving = true;
  rerenderChat();
  const prevConversations = conversations;
  if (conversations) {
    conversations = conversations.map((c) =>
      c.id === convId ? { ...c, title: trimmed } : c
    );
  }
  try {
    await toastPromise(
      (async () => {
        const res = await renameConversation({
          conversationId: convId,
          title: trimmed,
          credentials: credentials!,
        });
        if (!res.success) throw new Error(res.error);
        return res;
      })(),
      {
        loading: "Renaming chat\u2026",
        success: "Chat renamed",
        error: "Failed to rename chat",
      },
    );
    renameModalConvId = null;
  } catch (_e) {
    conversations = prevConversations;
  } finally {
    renameModalSaving = false;
    rerenderChat();
  }
};

const closeShortcutsModal = () => {
  shortcutsModalOpen = false;
  rerenderChat();
};

const shortcutsModalTemplate = () => {
  if (!shortcutsModalOpen) return nothing;
  const groups = shortcutHelpGroups(isMacPlatform());
  return html`
    <div
      data-testid="shortcuts-modal"
      class="fixed inset-0 z-50 bg-black/45 backdrop-blur-xs flex items-center justify-center p-4"
      @click="${closeShortcutsModal}"
    >
      <div
        class="anim-rise bg-white dark:bg-[#171614] border border-[#e7e4dc] dark:border-[#292824] rounded-2xl p-6 w-full max-w-md max-h-[82vh] overflow-y-auto shadow-xl flex flex-col gap-5"
        @click="${(e: Event) => e.stopPropagation()}"
      >
        <div class="flex items-center justify-between">
          <h3 class="text-base font-bold text-[#181715] dark:text-[#f3f1ea]">
            Keyboard Shortcuts
          </h3>
          <button
            type="button"
            class="w-7 h-7 rounded-full flex items-center justify-center text-[#78736a] hover:bg-black/6 dark:hover:bg-white/10 hover:text-[#181715] dark:hover:text-[#f3f1ea] transition-colors"
            aria-label="Close keyboard shortcuts"
            @click="${closeShortcutsModal}"
          >
            ✕
          </button>
        </div>
        ${groups.map(
          (group) =>
            html`
              <div class="flex flex-col gap-2">
                <div
                  class="text-[11px] font-semibold uppercase tracking-wider text-[#78736a] dark:text-[#8c867c]"
                >
                  ${group.title}
                </div>
                <div class="divide-y divide-[#efede6] dark:divide-[#24231f]">
                  ${group.items.map(
                    (item) =>
                      html`
                        <div class="flex items-center justify-between gap-3 py-1.5 text-sm">
                          <span class="text-[#3d3a35] dark:text-[#d8d4ca]">${item
                            .label}</span>
                          <span class="flex items-center gap-1 shrink-0">
                            ${item.keys.map(
                              (k) =>
                                html`
                                  <kbd
                                    class="px-1.5 py-0.5 text-xs font-mono rounded-md bg-[#f2efe8] dark:bg-[#24231f] border border-[#dcd8cc] dark:border-[#34322d] text-[#181715] dark:text-[#f3f1ea]"
                                  >${k}</kbd>
                                `,
                            )}
                          </span>
                        </div>
                      `,
                  )}
                </div>
              </div>
            `,
        )}
      </div>
    </div>
  `;
};

const renameModalTemplate = () =>
  renameModalConvId
    ? html`
      <div
        class="fixed inset-0 z-50 bg-black/45 backdrop-blur-xs flex items-center justify-center p-4"
        @click="${closeRenameModal}"
      >
        <div
          class="anim-rise bg-white dark:bg-[#171614] border border-[#e7e4dc] dark:border-[#292824] rounded-2xl p-6 w-full max-w-sm shadow-xl flex flex-col gap-4"
          @click="${(e: Event) => e.stopPropagation()}"
        >
          <h3
            class="text-lg font-bold text-center text-[#181715] dark:text-[#f3f1ea]"
          >
            Rename Chat
          </h3>
          <input
            id="landing-rename-input"
            type="text"
            maxlength="100"
            class="${inputStyle + " w-full"}"
            placeholder="Chat name"
            .value="${renameModalInput}"
            @input="${(e: Event) => {
              renameModalInput = (e.target as HTMLInputElement).value;
              rerenderChat();
            }}"
            @keydown="${(e: KeyboardEvent) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitRenameModal();
              } else if (e.key === "Escape") {
                e.preventDefault();
                closeRenameModal();
              }
            }}"
          />
          <div class="flex gap-2 justify-end">
            <button
              type="button"
              class="${buttonClass("secondary", "default", "flex-1")}"
              @click="${closeRenameModal}"
            >
              Cancel
            </button>
            <button
              type="button"
              class="${buttonClass("default", "default", "flex-1")}"
              ?disabled="${renameModalSaving || !renameModalInput.trim()}"
              @click="${submitRenameModal}"
            >
              ${renameModalSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    `
    : nothing;

// --- Sub-templates ---

const isMobileOrTouch = () => currentIsMobile || isTouchOnlyDevice();

const blurActiveInputOnMobile = () => {
  if (isMobileOrTouch()) blurActiveInput();
};

const setView_ = (v: View) => {
  blurActiveInputOnMobile();
  view = v;
  if (v === "identity" && !yourKeyBalanceData) fetchBalance();
  if (v === "chats" && selectedConversation) {
    acknowledgeActiveConversation(true);
  }
  syncUrlFromState();
  rerenderChat();
};

const selectConversation = (id: string) => {
  blurActiveInputOnMobile();
  const prevConv = conversations?.find((c) => c.id === id);
  const prevStatus = prevConv
    ? computeConversationUnread({
      conversationId: id,
      preview: conversationPreviews[id],
      selfPublicSignKey: credentials?.publicSignKey ?? "",
      state: unreadState,
      isActivelyViewing: false,
    })
    : null;
  openChatUnreadBanner = prevStatus && prevStatus.count > 0
    ? { conversationId: id, readAtBeforeOpen: prevStatus.effectiveReadAt }
    : null;
  selectedConversation = id;
  const params = new URLSearchParams(globalThis.location.search);
  params.set("c", id);
  globalThis.history.pushState(null, "", `${chatPath}?${params.toString()}`);
  acknowledgeActiveConversation(true);
  rerenderChat();
};

const goHome = () => navigate(homePath);

const toggleDark = () => {
  const dark = !currentDark;
  const root = document.documentElement;
  if (dark) root.classList.add("dark");
  else root.classList.remove("dark");
  localStorage.setItem("theme", dark ? "dark" : "light");
  setDarkModeOverride(dark ? "dark" : "light");
};

const scrollbarStyle = () =>
  `scrollbar-color:${currentDark ? "#292824 #141412" : "#d6d2c7 #faf9f5"}`;

const visibleConversations = (sq?: string) => {
  if (!conversations) return [];
  const query = sq?.trim().toLowerCase();
  const filtered = query
    ? conversations.filter((conv) => conv.title.toLowerCase().includes(query))
    : conversations;
  const scoped = filtered.filter((conv) =>
    showArchived ? isArchived(conv) : !isArchived(conv)
  );
  return showArchived ? scoped : sortConversations(scoped);
};

const syncPreviewTargets = () => {
  if (!previewsManager || !conversations) return;
  const visible = visibleConversations(searchQuery);
  const seen = new Set(visible.map((c) => c.id));
  const rest = conversations.filter((c) => !seen.has(c.id));
  previewsManager.setConversations([...visible, ...rest]);
};

// --- Conversation list item ---

const unreadAccentBarClass =
  "pointer-events-none absolute left-0 top-2 bottom-2 w-[3.5px] rounded-r-full bg-[#2563eb] dark:bg-[#60a5fa]";

const conversationRowButtonClass = (
  isSelected: boolean,
  isUnread: boolean,
  isSearchHighlighted: boolean,
) =>
  `relative overflow-hidden w-full text-left px-3 py-2.5 flex items-center gap-3 rounded-xl transition-colors ${
    isSelected
      ? "bg-[#ebe7dc] dark:bg-[#24231f]"
      : isUnread
      ? "bg-[#e8f0fe] hover:bg-[#dce8fd] dark:bg-[#1a273d] dark:hover:bg-[#22324f]"
      : "hover:bg-[#f0ede4] dark:hover:bg-[#1c1b18]"
  }${
    isSearchHighlighted
      ? " ring-2 ring-[#2563eb]/50 dark:ring-[#60a5fa]/50"
      : ""
  }`;

const conversationRowTitleClass = (isSelected: boolean, isUnread: boolean) =>
  `${
    isUnread
      ? "font-bold text-[#111110] dark:text-[#ffffff]"
      : isSelected
      ? "font-semibold text-[#181715] dark:text-[#f3f1ea]"
      : "font-normal text-[#524e47] dark:text-[#a8a298]"
  } text-sm truncate min-w-0`;

const conversationRowPreviewClass = (isUnread: boolean) =>
  `block truncate ${
    isUnread
      ? "font-semibold text-[#1f1e1b] dark:text-[#f3f1ea]"
      : "font-normal text-[#8c867c] dark:text-[#78736a]"
  }`;

const conversationRowTimeClass = (isUnread: boolean, hideOnHover: boolean) =>
  `text-[11px] shrink-0 tabular-nums ${
    isUnread
      ? "font-bold text-[#2563eb] dark:text-[#60a5fa]"
      : "font-normal text-[#9c968c] dark:text-[#66625b]"
  }${
    hideOnHover
      ? " group-hover:opacity-0 group-focus-within:opacity-0 transition-opacity"
      : ""
  }`;

const conversationRowActionsBgClass = (
  isSelected: boolean,
  isUnread: boolean,
) =>
  isSelected
    ? "bg-[#ebe7dc] dark:bg-[#24231f]"
    : isUnread
    ? "bg-[#dce8fd] dark:bg-[#22324f]"
    : "bg-[#f0ede4] dark:bg-[#1c1b18]";

const conversationActionBtnClass =
  "p-1.5 rounded-lg text-[#78736a] hover:bg-black/6 dark:hover:bg-white/10 hover:text-[#181715] dark:hover:text-[#f3f1ea]";

const pinnedSectionDividerClass =
  "mx-4 my-1 border-t border-[#e5e1d6] dark:border-[#24231f]";

const conversationListItem = (conv: Conversation, index: number) => {
  if (!credentials) {
    return html`
    `;
  }
  const otherParticipant = conv.participants.find(
    (p) => p.publicSignKey !== credentials!.publicSignKey,
  );
  const otherKey = otherParticipant?.publicSignKey ?? "";
  const participantName = otherParticipant?.name?.split("@")[0] ??
    nameCache.get(otherKey) ?? null;
  const displayName = conv.title || participantName;
  const isSelected = selectedConversation === conv.id;
  const isSearchHighlighted = !currentIsMobile && searchInputFocused &&
    index === searchHighlightIndex;
  const isCurrentlyArchived = isArchived(conv);
  const isCurrentlyPinned = !isCurrentlyArchived && isPinned(conv);
  const isGroupChat = conv.participants.length > 2;
  const preview = conversationPreviews[conv.id];
  const unread = unreadStatusFor(conv);
  const unreadLabel = formatUnreadBadgeLabel(unread.count, unread.overflow);
  const typingNames = activeTypingNamesForConversation(
    typingByConversation[conv.id],
    preview,
  );
  const typingLabel = formatConversationTypingLabel(typingNames, isGroupChat);
  const previewLine = preview
    ? formatConversationPreviewLine({
      preview,
      selfPublicSignKey: credentials.publicSignKey,
      participants: conv.participants,
      nameCache,
    })
    : null;
  const timeLabel = preview?.empty
    ? ""
    : formatConversationTime(preview?.timestamp || conv.updatedAt);

  const swipeTransition =
    "transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);";
  const transitionStyle = activeSwipeConvId === conv.id
    ? "transition: none;"
    : swipeTransition;
  const hideOnDesktopHoverClass = !currentIsMobile
    ? " group-hover:opacity-0 group-focus-within:opacity-0 transition-opacity"
    : "";

  return html`
    <li
      data-conversation-id="${conv.id}"
      data-unread="${unread.isUnread ? "true" : "false"}"
      data-pinned="${isCurrentlyPinned ? "true" : "false"}"
      class="relative group overflow-hidden px-2 py-0.5"
    >
      <!-- Swipe right reveal on mobile (Pin / Unpin) -->
      ${activeSwipeConvId === conv.id && activeSwipeOffset > 0 &&
          !isCurrentlyArchived
        ? html`
          <div
            class="absolute inset-x-2 inset-y-0.5 bg-[#2563eb] dark:bg-[#3b82f6] text-white flex items-center justify-start pl-5 pointer-events-none rounded-xl"
          >
            <div
              class="flex flex-col items-center justify-center gap-0.5"
              style="transform: scale(${Math.min(
                1.2,
                Math.max(0.8, Math.abs(activeSwipeOffset) / 80),
              )}); transition: transform 0.1s ease-out;"
            >
              ${swipePinSvg}
              <span class="text-[10px] font-bold uppercase tracking-wider"
              >${isCurrentlyPinned ? "Unpin" : "Pin"}</span>
            </div>
          </div>
        `
        : null}

      <!-- Swipe left reveal on mobile (Archive / Unarchive) -->
      ${activeSwipeConvId === conv.id && activeSwipeOffset < 0
        ? html`
          <div
            class="absolute inset-x-2 inset-y-0.5 bg-[#39587f] text-white flex items-center justify-end pr-5 pointer-events-none rounded-xl"
          >
            <div
              class="flex flex-col items-center justify-center gap-0.5"
              style="transform: scale(${Math.min(
                1.2,
                Math.max(0.8, Math.abs(activeSwipeOffset) / 80),
              )}); transition: transform 0.1s ease-out;"
            >
              <svg
                class="w-5 h-5"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                viewBox="0 0 24 24"
              >
                ${isCurrentlyArchived
                  ? html`
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15M9 12l3-3m0 0l3 3m-3-3V15"
                    />
                  `
                  : html`
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                    />
                  `}
              </svg>
              <span class="text-[10px] font-bold uppercase tracking-wider"
              >${isCurrentlyArchived ? "Unarchive" : "Archive"}</span>
            </div>
          </div>
        `
        : null}

      <div
        style="transform: translateX(${activeSwipeConvId === conv.id
          ? activeSwipeOffset
          : 0}px); ${transitionStyle}"
        class="w-full"
        @touchstart="${(e: TouchEvent) => handleTouchStart(e, conv.id)}"
        @touchmove="${(e: TouchEvent) => handleTouchMove(e, conv.id)}"
        @touchend="${(e: TouchEvent) => handleTouchEnd(e, conv.id)}"
      >
        <button
          type="button"
          class="${conversationRowButtonClass(
            isSelected,
            unread.isUnread,
            isSearchHighlighted,
          )}"
          @click="${() => {
            if (wasSwiping) return;
            selectConversation(conv.id);
          }}"
        >
          ${unread.isUnread
            ? html`
              <span
                data-testid="conversation-unread-bar"
                aria-hidden="true"
                class="${unreadAccentBarClass}"
              ></span>
            `
            : nothing}
          ${displayName === null ? shimmerCircle(40) : chatAvatar({
            image: otherParticipant?.avatar,
            name: displayName,
            baseColor: avatarColor(otherKey, currentDark),
            size: 40,
          })}
          <div class="flex-grow overflow-hidden min-w-0">
            <div class="flex items-baseline justify-between gap-2">
              <div
                data-testid="conversation-title"
                class="${conversationRowTitleClass(
                  isSelected,
                  unread.isUnread,
                )}"
              >
                ${displayName === null ? shimmerText() : displayName}
              </div>
              ${timeLabel
                ? html`
                  <span
                    data-testid="conversation-time"
                    class="${conversationRowTimeClass(
                      unread.isUnread,
                      !currentIsMobile,
                    )}"
                  >${timeLabel}</span>
                `
                : nothing}
            </div>
            <div class="mt-0.5 flex items-center justify-between gap-2 min-h-[1.25rem]">
              <div class="text-xs truncate leading-4 min-w-0 flex-1">
                ${typingLabel
                  ? html`
                    <span
                      data-testid="conversation-typing-indicator"
                      class="inline-flex items-center gap-1.5 font-medium text-[#2563eb] dark:text-[#60a5fa] max-w-full"
                    >
                      <span class="typing-dots-inline" aria-hidden="true">
                        <span></span><span></span><span></span>
                      </span>
                      <span class="truncate">${typingLabel}</span>
                    </span>
                  `
                  : previewLine
                  ? html`
                    <span
                      data-testid="conversation-last-message"
                      class="${conversationRowPreviewClass(unread.isUnread)}"
                    >${previewLine}</span>
                  `
                  : preview?.empty
                  ? html`
                    <span
                      class="block truncate italic text-[#9c968c] dark:text-[#66625b]"
                    >No messages yet</span>
                  `
                  : nothing}
              </div>
              ${isCurrentlyPinned || unread.isUnread
                ? html`
                  <span
                    class="${`inline-flex items-center gap-1.5 shrink-0${hideOnDesktopHoverClass}`}"
                  >
                    ${isCurrentlyPinned
                      ? html`
                        <span
                          data-testid="conversation-pin-indicator"
                          aria-label="Pinned"
                          title="Pinned"
                          class="inline-flex items-center text-[#8c867c] dark:text-[#8c867c]"
                        >${pinnedIndicatorSvg}</span>
                      `
                      : nothing}
                    ${unread.isUnread
                      ? unreadLabel
                        ? html`
                          <span
                            data-testid="conversation-unread-badge"
                            aria-label="${unread.count === 1
                              ? "1 unread message"
                              : `${unreadLabel} unread messages`}"
                            class="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-[#2563eb] text-white dark:bg-[#60a5fa] dark:text-[#0d1526] text-[11px] font-bold leading-none tabular-nums shadow-2xs shrink-0"
                          >${unreadLabel}</span>
                        `
                        : html`
                          <span
                            data-testid="conversation-unread-badge"
                            data-unread-dot
                            aria-label="Unread"
                            class="w-2.5 h-2.5 rounded-full bg-[#2563eb] dark:bg-[#60a5fa] ring-2 ring-[#2563eb]/20 dark:ring-[#60a5fa]/25 shrink-0"
                          ></span>
                        `
                      : nothing}
                  </span>
                `
                : nothing}
            </div>
          </div>
        </button>
        ${displayName !== null && !currentIsMobile
          ? html`
            <div
              class="${`absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center gap-0.5 pl-2 py-1 rounded-lg ${
                conversationRowActionsBgClass(isSelected, unread.isUnread)
              }`}"
            >
              ${!isCurrentlyArchived
                ? html`
                  <button
                    type="button"
                    data-testid="toggle-pin-button"
                    aria-pressed="${isCurrentlyPinned ? "true" : "false"}"
                    class="${`${conversationActionBtnClass}${
                      isCurrentlyPinned
                        ? " text-[#2563eb] dark:text-[#60a5fa]"
                        : ""
                    }`}"
                    title="${isCurrentlyPinned ? "Unpin chat" : "Pin chat"}"
                    aria-label="${isCurrentlyPinned
                      ? "Unpin chat"
                      : "Pin chat"}"
                    @click="${(e: Event) => {
                      e.stopPropagation();
                      if (isCurrentlyPinned) {
                        unpinConversation(conv.id);
                      } else {
                        pinConversation(conv.id);
                      }
                    }}"
                  >
                    ${isCurrentlyPinned ? unpinSvg : pinSvg}
                  </button>
                `
                : nothing}
              <button
                type="button"
                data-testid="toggle-unread-button"
                class="${conversationActionBtnClass}"
                title="${unread.isUnread ? "Mark as read" : "Mark as unread"}"
                aria-label="${unread.isUnread
                  ? "Mark as read"
                  : "Mark as unread"}"
                @click="${(e: Event) => {
                  e.stopPropagation();
                  if (unread.isUnread) {
                    markConversationAsRead(conv.id);
                    if (openChatUnreadBanner?.conversationId === conv.id) {
                      openChatUnreadBanner = null;
                    }
                    rerenderChat();
                  } else {
                    markConversationAsUnread(conv.id);
                  }
                }}"
              >
                ${unread.isUnread ? markReadSvg : markUnreadSvg}
              </button>
              <button
                type="button"
                class="${conversationActionBtnClass}"
                title="Rename Chat"
                @click="${(e: Event) => {
                  e.stopPropagation();
                  openRenameModal(conv.id, displayName);
                }}"
              >
                ${renameSvg}
              </button>
              <button
                type="button"
                data-testid="toggle-archive-button"
                class="${conversationActionBtnClass}"
                title="${isCurrentlyArchived
                  ? "Unarchive Chat"
                  : "Archive Chat"}"
                @click="${(e: Event) => {
                  e.stopPropagation();
                  if (isCurrentlyArchived) {
                    unarchiveConversation(conv.id);
                  } else {
                    archiveConversation(conv.id);
                  }
                }}"
              >
                ${isCurrentlyArchived ? unarchiveSvg : archiveSvg}
              </button>
            </div>
          `
          : nothing}
      </div>
    </li>
  `;
};

// --- Empty chats ---

const emptyStateLinkClass =
  "text-xs font-medium text-[#57534e] dark:text-[#a8a298] hover:text-[#181715] dark:hover:text-[#f3f1ea] underline underline-offset-4 decoration-[#d2cec3] dark:decoration-[#3a3832] transition-colors cursor-pointer";

const starterAgentRowClass =
  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/90 dark:bg-[#151513] border border-[#e7e4dc] dark:border-[#262521] hover:border-[#cfc9bc] dark:hover:border-[#3c3a34] hover:bg-[#faf8f3] dark:hover:bg-[#1c1b18] transition-colors text-left cursor-pointer disabled:opacity-60";

let startingAgentAlias: string | null = null;

const shareFriendInviteLink = () => {
  if (!credentials) return;
  const shareFn = typeof navigator !== "undefined" &&
      typeof navigator.share === "function"
    ? (data: { title: string; text: string; url: string }) =>
      navigator.share(data)
    : undefined;
  chatWithMeLink(credentials.publicSignKey)
    .then((link) =>
      shareOrCopyInviteLink(link, { shareFn, copyFn: copyToClipboard })
    )
    .then((result) => {
      if (result === "copied") {
        showToast("Invite link copied — send it to a friend!", "success");
      } else if (result === "failed") {
        showToast("Failed to copy invite link", "error");
      }
    })
    .catch(() => showToast("Failed to create invite link", "error"));
};

const openStarterAgentChat = (alias: string, onDone?: () => void) => {
  if (!credentials || startingAgentAlias) return;
  const creds = credentials;
  startingAgentAlias = alias;
  rerenderChat();
  resolveHandle(alias)
    .then((res) => {
      const resolvedKey = "publicSignKey" in res ? res.publicSignKey : alias;
      const existing = (conversations ?? []).find(
        isMatch(creds.publicSignKey, resolvedKey),
      );
      if (existing) {
        selectConversation(existing.id);
        onDone?.();
        return;
      }
      return startConversation(creds, alias).then((id) => {
        if (id) onDone?.();
      });
    })
    .catch((error) => {
      console.error("Failed to open starter agent chat:", error);
      showToast("Failed to start conversation", "error");
    })
    .finally(() => {
      startingAgentAlias = null;
      rerenderChat();
    });
};

const starterAgentRow = (onDone?: () => void) => (agent: StarterAgent) =>
  html`
    <button
      type="button"
      class="${starterAgentRowClass}"
      ?disabled="${startingAgentAlias !== null}"
      @click="${() => openStarterAgentChat(agent.alias, onDone)}"
    >
      <span
        class="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${agent
          .avatarBg}"
      >${agent.initials}</span>
      <span class="min-w-0 flex-1">
        <span class="flex items-center gap-1.5">
          <span
            class="text-xs font-semibold text-[#181715] dark:text-[#f3f1ea] truncate"
          >${agent.name}</span>
          <span class="text-[11px] font-mono text-[#78736a] dark:text-[#8c867c]"
          >@${agent.alias}</span>
        </span>
        <span
          class="block text-[11px] text-[#66625b] dark:text-[#9c968c] truncate"
        >${startingAgentAlias === agent.alias
          ? "Starting encrypted chat..."
          : agent.tagline}</span>
      </span>
      <span
        class="text-xs text-[#78736a] dark:text-[#8c867c] shrink-0"
        aria-hidden="true"
      >&rarr;</span>
    </button>
  `;

const starterAgentsSection = (onDone?: () => void) =>
  html`
    <div class="w-full max-w-sm mt-5">
      <div
        class="text-[11px] font-medium uppercase tracking-wider text-[#78736a] dark:text-[#8c867c] mb-2 text-left px-1"
      >
        Try a live agent
      </div>
      <div class="flex flex-col gap-2">
        ${starterAgents.map(starterAgentRow(onDone))}
      </div>
    </div>
  `;

const emptyChatsView = (sq?: string, onNewChat?: () => void) => {
  const isEmpty = !sq?.trim();
  return html`
    <div
      class="anim-rise"
      style="display:flex;flex-direction:column;flex-grow:1;align-items:center;justify-content:center;padding:24px"
    >
      ${isEmpty
        ? html`
          <img
            src="/icon.png"
            alt="Alice&Bot"
            class="block dark:hidden w-14 h-14 mb-3 anim-float opacity-95 object-contain"
          />
          <img
            src="/icon-dark.png"
            alt="Alice&Bot"
            class="hidden dark:block w-14 h-14 mb-3 anim-float opacity-95 object-contain"
          />
          <p class="text-sm text-[#78736a] dark:text-[#8c867c] mb-4 text-center">
            Try talking to a live agent or invite a friend
          </p>
          <div class="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              class="${buttonClass("default", "default", "px-5")}"
              @click="${onNewChat}"
            >
              + New Chat
            </button>
            ${credentials
              ? html`
                <button
                  type="button"
                  class="${buttonClass("secondary", "default", "px-4")}"
                  @click="${shareFriendInviteLink}"
                >
                  Invite a friend
                </button>
              `
              : nothing}
          </div>
          ${credentials ? starterAgentsSection() : nothing}
          <div class="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            <a href="${mcpGuidePath}" class="${emptyStateLinkClass}">
              Connect your own agent (MCP)
            </a>
          </div>
        `
        : html`
          <div class="text-sm text-[#78736a] dark:text-[#8c867c]">
            No matching chats
          </div>
        `}
    </div>
  `;
};

// --- Open chats ---

const openChats = (sq?: string, onNewChat?: () => void) => {
  if (conversations === null) {
    return html`
      <div
        style="display:flex;flex-direction:column;flex-grow:1;align-items:center;justify-content:center"
      >
        ${spinner()}
      </div>
    `;
  }
  const displayList = visibleConversations(sq);
  const pinnedCount = showArchived ? 0 : displayList.filter(isPinned).length;
  const showPinnedDivider = pinnedCount > 0 && pinnedCount < displayList.length;

  return html`
    <div style="display:flex;flex-direction:column;flex-grow:1">
      ${displayList.length === 0 ? emptyChatsView(sq, onNewChat) : html`
        <ul class="flex flex-col">
          ${displayList.map((conv, index) =>
            html`
              ${conversationListItem(conv, index)}
              ${showPinnedDivider && index === pinnedCount - 1
                ? html`
                  <li
                    role="separator"
                    data-testid="pinned-chats-divider"
                    aria-hidden="true"
                    class="${pinnedSectionDividerClass}"
                  ></li>
                `
                : nothing}
            `
          )}
        </ul>
      `}
    </div>
  `;
};

// --- New chat screen ---

const newChatScreen = (onChatCreated?: () => void) => {
  if (!credentials) {
    return html`
    `;
  }
  const creds = credentials;
  const onStart = () =>
    startConversation(creds, newChatInput)
      .then(() => {
        newChatInput = "";
        onChatCreated?.();
        rerenderChat();
      })
      .catch((error) => {
        console.error("Failed to start conversation:", error);
        showToast("Failed to start conversation", "error");
      });
  return html`
    <div class="anim-rise flex flex-col items-center px-4 py-8">
      <div class="${settingsCardClass + " w-full max-w-md"}">
        <div class="flex flex-col gap-3">
          <input
            id="newChatInput"
            class="${inputStyle + " w-full"}"
            placeholder="@alias or public key"
            .value="${newChatInput}"
            aria-label="Recipient alias or public key"
            @input="${(e: Event) => {
              newChatInput = (e.target as HTMLInputElement).value;
            }}"
            @keydown="${(e: KeyboardEvent) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onStart();
              }
            }}"
          />
          <div class="${hintStyle}">
            Separate multiple handles with commas. Want to message your own AI
            agent?
            <a
              href="${mcpGuidePath}"
              class="underline underline-offset-2 hover:text-[#181715] dark:hover:text-[#f3f1ea]"
            >Set up MCP</a>.
          </div>
          <button
            type="button"
            class="${buttonClass("default", "default", "w-full")}"
            @click="${onStart}"
          >
            Start Chat
          </button>
          <div
            class="pt-3 mt-1 border-t border-[#ece8df] dark:border-[#24231f] flex flex-col gap-3"
          >
            <button
              type="button"
              class="${buttonClass("secondary", "default", "w-full")}"
              @click="${shareFriendInviteLink}"
            >
              Share invite link with a friend
            </button>
            <div>
              <div
                class="text-[11px] font-medium uppercase tracking-wider text-[#78736a] dark:text-[#8c867c] mb-2"
              >
                Or try a live agent
              </div>
              <div class="flex flex-col gap-2">
                ${starterAgents.map(starterAgentRow(onChatCreated))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
};

// --- Settings helpers ---

const settingsRowClass =
  "flex items-center justify-between gap-3 py-3.5 first:pt-0 last:pb-0";

const copyInvitePill = (publicSignKey: string) => {
  const onClick = async () => {
    try {
      const link = await chatWithMeLink(publicSignKey);
      if (await copyToClipboard(link)) {
        showToast("Invite link copied!", "success");
      } else showToast("Failed to copy invite link", "error");
    } catch (_e) {
      showToast("Failed to copy invite link", "error");
    }
  };
  return html`
    <button
      type="button"
      class="${buttonClass("default", "sm", "px-4")}"
      @click="${onClick}"
    >
      Copy Invite Link
    </button>
  `;
};

const copyPublicKeyPill = (publicSignKey: string) => {
  const onClick = async () => {
    try {
      if (!(await copyToClipboard(publicSignKey))) return;
      copiedPublicKey = true;
      rerenderChat();
      setTimeout(() => {
        copiedPublicKey = false;
        rerenderChat();
      }, 2000);
    } catch (e) {
      console.error("Failed to copy public key", e);
    }
  };
  return html`
    <button
      type="button"
      class="${buttonClass("secondary", "sm", "px-4")}"
      title="Copy public key"
      @click="${onClick}"
    >
      ${copiedPublicKey ? "Copied!" : "Copy Public Key"}
    </button>
  `;
};

const copyCredentialsRow = () => {
  const onClick = async () => {
    try {
      const creds = getCredentialsToCopy("alicebot_credentials", credentials);
      if (!creds || !(await copyToClipboard(creds))) return;
      copiedCredentials = true;
      rerenderChat();
      setTimeout(() => {
        copiedCredentials = false;
        rerenderChat();
      }, 2000);
    } catch (e) {
      console.error("Failed to copy credentials", e);
    }
  };
  return html`
    <div class="${settingsRowClass}">
      <div>
        <div class="text-sm font-medium">Secret recovery key</div>
        <div class="text-xs text-[#78736a] dark:text-[#8c867c]">
          Save offline to restore your account anywhere
        </div>
      </div>
      <button
        type="button"
        class="${buttonClass("secondary", "sm", "shrink-0")}"
        @click="${onClick}"
      >
        ${copiedCredentials ? "Copied!" : "Copy Key"}
      </button>
    </div>
  `;
};

const legalLinkClass =
  "underline hover:text-[#181715] dark:hover:text-[#f3f1ea] transition-colors";

const handleSignOut = async () => {
  if (
    !confirm(
      "Sign out and delete your key from this browser? Make sure you backed up your secret key first.",
    )
  ) return;
  const activeCredentials = credentials;
  if (activeCredentials) {
    await unregisterPush(activeCredentials).catch(() => {});
  }
  localStorage.removeItem("alicebot_credentials");
  localStorage.removeItem(conversationsCacheKey);
  localStorage.removeItem(conversationPreviewsCacheKey);
  localStorage.removeItem(unreadStateStorageKey);
  syncFaviconDot(false);
  syncNavigatorAppBadge(0);
  await Promise.all([
    clearPushKeyStore().catch(() => {}),
    closeLocalNotificationsForConversation().catch(() => {}),
  ]).finally(() => {
    globalThis.location.reload();
  });
};

const deleteCredentialsRow = () =>
  html`
    <div class="${settingsRowClass}">
      <div>
        <div class="text-sm font-medium">Sign out</div>
        <div class="text-xs text-[#78736a] dark:text-[#8c867c]">
          Removes stored credentials from this browser
        </div>
      </div>
      <button
        type="button"
        class="${buttonClass("destructive", "sm", "shrink-0")}"
        @click="${handleSignOut}"
      >
        Sign Out
      </button>
    </div>
  `;

const dangerZone = () =>
  html`
    <div
      class="bg-white dark:bg-[#151513] border border-[#e7e4dc] dark:border-[#252420] rounded-2xl overflow-hidden"
    >
      <button
        type="button"
        class="w-full flex justify-between items-center px-5 py-4 text-left hover:bg-[#faf9f5] dark:hover:bg-[#1b1a17] transition-colors cursor-pointer"
        @click="${() => {
          dangerZoneOpen = !dangerZoneOpen;
          rerenderChat();
        }}"
      >
        <span class="text-sm font-semibold">Backup key & sign out</span>
        <span class="text-[#78736a] dark:text-[#8c867c]">${chevron(
          dangerZoneOpen,
        )}</span>
      </button>
      ${dangerZoneOpen
        ? html`
          <div
            class="px-5 pb-4 pt-2 border-t border-[#ece8df] dark:border-[#24231f] divide-y divide-[#ece8df] dark:divide-[#24231f]"
          >
            ${copyCredentialsRow()}${deleteCredentialsRow()}
          </div>
        `
        : nothing}
    </div>
  `;

const qrCodeTransferRow = () => {
  if (!credentials) {
    return html`
    `;
  }
  const creds = credentials;
  const onGenerate = async () => {
    qrLoading = true;
    qrError = null;
    qrDataUrl = null;
    qrTransferUrl = null;
    qrCopied = false;
    rerenderChat();
    try {
      const url = await generateTransferUrl(creds);
      qrTransferUrl = url;
      qrDataUrl = await generateTransferQr(url);
    } catch (e) {
      qrError = e instanceof Error ? e.message : "Failed to generate QR code";
    }
    qrLoading = false;
    rerenderChat();
  };
  const onCopy = async () => {
    try {
      if (!qrTransferUrl || !(await copyToClipboard(qrTransferUrl))) return;
      qrCopied = true;
      rerenderChat();
    } catch (e) {
      console.error("Failed to copy transfer URL", e);
    }
  };
  return html`
    <div class="py-3.5 first:pt-0 last:pb-0">
      <div class="flex items-center justify-between gap-3">
        <div>
          <div class="text-sm font-medium">Connect another device</div>
          <div class="text-xs text-[#78736a] dark:text-[#8c867c]">
            One-time QR code · valid 5 min
          </div>
        </div>
        <button
          type="button"
          class="${buttonClass("secondary", "sm", "shrink-0")}"
          ?disabled="${qrLoading}"
          @click="${onGenerate}"
        >
          ${qrLoading ? "Generating..." : qrDataUrl ? "New QR" : "Show QR"}
        </button>
      </div>
      ${qrError
        ? html`
          <div class="text-xs text-red-600 dark:text-red-400 mt-2">${qrError}</div>
        `
        : nothing} ${qrDataUrl
        ? html`
          <div class="mt-3 flex flex-col items-center gap-2">
            <div class="p-3 bg-white rounded-2xl border border-[#e7e4dc]">
              <img
                src="${qrDataUrl}"
                alt="Transfer QR code"
                width="200"
                height="200"
              />
            </div>
            ${qrTransferUrl
              ? html`
                <button
                  type="button"
                  class="${buttonClass("link", "sm", "px-0 h-auto text-xs")}"
                  @click="${onCopy}"
                >
                  ${qrCopied ? "Copied!" : "Copy transfer link instead"}
                </button>
              `
              : nothing}
          </div>
        `
        : nothing}
    </div>
  `;
};

// --- YourKey (account settings) ---

const retentionNotice = (extraClass = "") =>
  html`
    <p
      class="text-center text-[#78736a] dark:text-[#8c867c] leading-relaxed ${extraClass}"
    >
      ${retentionSummary}
      <a
        href="${retentionPolicyPath}"
        target="_blank"
        rel="noopener noreferrer"
        class="${legalLinkClass}"
      >Details</a>
    </p>
  `;

const yourKey = () => {
  if (!credentials) {
    return html`
    `;
  }
  const publicSignKey = credentials.publicSignKey;

  const onSaveName = async () => {
    const trimmed = yourKeyNameInput.trim();
    if (!trimmed) {
      yourKeyNameStatus = { type: "error", message: "Name can't be empty" };
      rerenderChat();
      return;
    }
    yourKeySavingName = true;
    yourKeyNameStatus = null;
    rerenderChat();
    try {
      const res = await setName({ name: trimmed, credentials: credentials! });
      yourKeySavingName = false;
      if (res.success) {
        yourKeyNameStatus = { type: "success", message: "Name saved" };
        setTimeout(() => {
          yourKeyNameStatus = null;
          rerenderChat();
        }, 2000);
      } else {
        const message = res.error === "invalid-name"
          ? "Invalid name (max 50 characters)"
          : res.error === "not-found"
          ? "Identity not found"
          : "Authentication failed";
        yourKeyNameStatus = { type: "error", message };
      }
    } catch (_e) {
      yourKeySavingName = false;
      yourKeyNameStatus = { type: "error", message: "Failed to save name" };
    }
    rerenderChat();
  };

  const onSaveAlias = async () => {
    const trimmed = yourKeyAliasInput.trim();
    if (!trimmed) {
      yourKeyAliasStatus = { type: "error", message: "Alias can't be empty" };
      rerenderChat();
      return;
    }
    yourKeySavingAlias = true;
    yourKeyAliasStatus = null;
    rerenderChat();
    try {
      const res = await setAlias({ alias: trimmed, credentials: credentials! });
      yourKeySavingAlias = false;
      if (res.success) {
        yourKeyAliasStatus = { type: "success", message: "Alias saved" };
        yourKeyAliasInput = trimmed.toLowerCase().replace(/[^a-z0-9_]/g, "")
          .slice(0, 15);
        setTimeout(() => {
          yourKeyAliasStatus = null;
          rerenderChat();
        }, 2000);
      } else {
        let message = "Failed to set alias";
        if (res.error === "alias-taken") message = "Alias already taken";
        if (res.error === "invalid-alias") message = "Invalid alias";
        if (res.error === "not-found") message = "Identity not found";
        if (res.error === "invalid-auth") message = "Authentication failed";
        yourKeyAliasStatus = { type: "error", message };
      }
    } catch (_e) {
      yourKeySavingAlias = false;
      yourKeyAliasStatus = { type: "error", message: "Failed to set alias" };
    }
    rerenderChat();
  };

  const onSavePrice = async () => {
    const val = parseFloat(yourKeyPriceTagInput);
    if (isNaN(val) || val < 0) {
      yourKeyPriceStatus = { type: "error", message: "Invalid price" };
      rerenderChat();
      return;
    }
    yourKeySavingPrice = true;
    yourKeyPriceStatus = null;
    rerenderChat();
    const priceTagCents = Math.round(val * 100);
    try {
      const res = await setPriceTagSigned({
        priceTag: priceTagCents,
        credentials: credentials!,
      });
      yourKeySavingPrice = false;
      if (res.success) {
        yourKeyPriceStatus = { type: "success", message: "Price saved" };
        setTimeout(() => {
          yourKeyPriceStatus = null;
          rerenderChat();
        }, 2000);
      } else {
        yourKeyPriceStatus = { type: "error", message: "Failed to save price" };
      }
    } catch (_e) {
      yourKeySavingPrice = false;
      yourKeyPriceStatus = { type: "error", message: "Failed to save price" };
    }
    rerenderChat();
  };

  const onDeposit = async () => {
    const amountStr = globalThis.prompt("Enter amount to deposit (USD)", "10");
    if (!amountStr) return;
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
      showToast("Invalid amount");
      return;
    }
    showToast("Generating deposit address...");
    try {
      const res = await prepareCryptoPaymentSigned({
        amount,
        credentials: credentials!,
      });
      if ("error" in res) {
        showToast(`Failed: ${res.error}`, "error");
      } else {
        yourKeyDepositData = res;
        startDepositPolling();
        rerenderChat();
      }
    } catch (_e) {
      showToast("Failed to generate deposit address", "error");
    }
  };

  const onCheckPayment = async () => {
    if (!yourKeyDepositData) return;
    showToast("Checking payment...");
    try {
      const res = await checkCryptoPaymentSigned({
        paymentAddress: yourKeyDepositData.address,
        credentials: credentials!,
      });
      if ("error" in res) {
        showToast(
          res.error === "not-paid"
            ? "Payment not found yet. We are checking automatically."
            : `Failed: ${res.error}`,
          "error",
        );
      } else {
        showToast(res.message, "success");
        yourKeyDepositData = null;
        stopDepositPolling();
        fetchBalance();
        rerenderChat();
      }
    } catch (_e) {
      showToast("Failed to check payment", "error");
    }
  };

  const statusBadge = (
    status: { type: "success" | "error"; message: string } | null,
  ) =>
    status
      ? html`
        <div class="${`text-xs ${
          status.type === "success"
            ? "text-[#39587f] dark:text-[#7da2cf]"
            : "text-red-600 dark:text-red-400"
        }`}">${status.message}</div>
      `
      : html`
      `;

  const displayTitle = yourKeyNameInput.trim() || "Anonymous";
  const currentPriceNum = parseFloat(yourKeyPriceTagInput);
  const priceBadgeText = !isNaN(currentPriceNum) && currentPriceNum > 0
    ? `$${currentPriceNum.toFixed(2)} / chat`
    : "Free";
  const showPaidDetails = paidInboxOpen || Boolean(yourKeyDepositData);

  return html`
    <div style="display:flex;flex-direction:column" class="${textColorStyle} mb-2 gap-4">
      <!-- Profile & Quick Share -->
      <div class="${settingsCardClass}">
        <div class="flex flex-col items-center text-center gap-2.5 pb-2">
          <div class="scale-125 my-1">
            ${chatAvatar({
              image: yourKeyProfile?.avatar,
              name: displayTitle,
              baseColor: avatarColor(publicSignKey, currentDark),
            })}
          </div>
          <div>
            <div class="text-base font-bold tracking-tight">${displayTitle}</div>
            ${yourKeyProfile?.alias
              ? html`
                <div class="text-xs font-mono text-[#78736a] dark:text-[#8c867c]">
                  @${yourKeyProfile.alias}
                </div>
              `
              : nothing}
          </div>
          <div class="flex flex-wrap items-center justify-center gap-2 pt-1">
            ${copyInvitePill(publicSignKey)} ${copyPublicKeyPill(publicSignKey)}
          </div>
        </div>

        <div class="border-t border-[#ece8df] dark:border-[#24231f] pt-4 space-y-3">
          <div class="flex flex-col gap-1">
            <label class="${labelSmallStyle}">Display name</label>
            <div class="flex gap-2 items-center">
              <input
                class="${inputStyle + " flex-1 max-w-none py-2 text-sm"}"
                placeholder="Your name"
                .value="${yourKeyNameInput}"
                @input="${(e: Event) => {
                  yourKeyNameInput = (e.target as HTMLInputElement).value.slice(
                    0,
                    50,
                  );
                }}"
                @keydown="${(e: KeyboardEvent) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onSaveName();
                  }
                }}"
                ?disabled="${yourKeySavingName}"
              />
              <button
                type="button"
                class="${buttonClass("secondary", "sm", "px-4 shrink-0")}"
                ?disabled="${yourKeySavingName}"
                @click="${onSaveName}"
              >
                ${yourKeySavingName ? "Saving..." : "Save"}
              </button>
            </div>
            ${statusBadge(yourKeyNameStatus)}
          </div>

          <div class="flex flex-col gap-1">
            <label class="${labelSmallStyle}">Public handle</label>
            <div class="flex gap-2 items-center">
              <div class="relative flex-1">
                <span
                  class="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-mono text-[#8c867c] select-none"
                >@</span>
                <input
                  class="${inputStyle +
                    " w-full max-w-none pl-8 py-2 text-sm font-mono"}"
                  placeholder="handle"
                  .value="${yourKeyAliasInput}"
                  @input="${(e: Event) => {
                    yourKeyAliasInput = (e.target as HTMLInputElement).value
                      .toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 15);
                  }}"
                  @keydown="${(e: KeyboardEvent) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onSaveAlias();
                    }
                  }}"
                  ?disabled="${yourKeySavingAlias}"
                />
              </div>
              <button
                type="button"
                class="${buttonClass("secondary", "sm", "px-4 shrink-0")}"
                ?disabled="${yourKeySavingAlias}"
                @click="${onSaveAlias}"
              >
                ${yourKeySavingAlias
                  ? "Saving..."
                  : yourKeyProfile?.alias
                  ? "Update"
                  : "Set"}
              </button>
            </div>
            ${statusBadge(yourKeyAliasStatus)}
          </div>
        </div>
      </div>

      <!-- Devices & Notifications -->
      <div
        class="bg-white dark:bg-[#151513] border border-[#e7e4dc] dark:border-[#252420] rounded-2xl px-5 py-4 divide-y divide-[#ece8df] dark:divide-[#24231f]"
      >
        ${qrCodeTransferRow()}
        <div class="${settingsRowClass}">
          <div>
            <div class="text-sm font-medium">Push notifications</div>
            <div class="text-xs text-[#78736a] dark:text-[#8c867c]">
              Alerts when agents or people reply
            </div>
          </div>
          <button
            type="button"
            class="${buttonClass("secondary", "sm", "shrink-0")}"
            @click="${() =>
              toastPromise(registerPush(credentials!), {
                loading: "Enabling notifications\u2026",
                success: "Notifications enabled",
                error: formatPushError,
              }).catch(() => {})}"
          >
            Enable
          </button>
        </div>
        ${!isStandaloneApp()
          ? html`
            <div class="${settingsRowClass}">
              <div>
                <div class="text-sm font-medium">Install app</div>
                <div class="text-xs text-[#78736a] dark:text-[#8c867c]">
                  Add Alice&Bot to your home screen
                </div>
              </div>
              <button
                type="button"
                class="${buttonClass("default", "sm", "shrink-0")}"
                @click="${handleChatInstallClick}"
              >
                Install
              </button>
            </div>
          `
          : nothing}
      </div>

      <!-- Paid Inbox & Wallet (Collapsible) -->
      <div
        class="bg-white dark:bg-[#151513] border border-[#e7e4dc] dark:border-[#252420] rounded-2xl overflow-hidden"
      >
        <button
          type="button"
          class="w-full flex justify-between items-center px-5 py-4 text-left hover:bg-[#faf9f5] dark:hover:bg-[#1b1a17] transition-colors cursor-pointer"
          @click="${() => {
            paidInboxOpen = !paidInboxOpen;
            rerenderChat();
          }}"
        >
          <span class="text-sm font-semibold">Paid inbox & wallet</span>
          <span class="flex items-center gap-2 text-xs text-[#78736a] dark:text-[#8c867c]">
            <span class="px-2 py-0.5 rounded-full bg-[#efede6] dark:bg-[#22211d]"
            >${priceBadgeText}</span>
            ${chevron(showPaidDetails)}
          </span>
        </button>
        ${showPaidDetails
          ? html`
            <div
              class="px-5 pb-5 pt-3 border-t border-[#ece8df] dark:border-[#24231f] space-y-4"
            >
              <div class="flex flex-col gap-1.5">
                <label class="${labelSmallStyle}"
                >Price for strangers to message you (USD)</label>
                <div class="flex gap-2 items-center">
                  <span class="text-sm text-[#78736a]">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    .value="${yourKeyPriceTagInput}"
                    @input="${(e: Event) => {
                      yourKeyPriceTagInput =
                        (e.target as HTMLInputElement).value;
                    }}"
                    class="${inputStyle + " flex-1 max-w-none py-2 text-sm"}"
                    placeholder="0.00"
                  />
                  <button
                    type="button"
                    class="${buttonClass("secondary", "sm", "px-4 shrink-0")}"
                    ?disabled="${yourKeySavingPrice}"
                    @click="${onSavePrice}"
                  >
                    ${yourKeySavingPrice ? "Saving..." : "Save"}
                  </button>
                </div>
                ${statusBadge(yourKeyPriceStatus)}
              </div>

              ${yourKeyBalanceData
                ? html`
                  <div
                    class="flex items-center justify-between p-3.5 bg-[#f6f4ee] dark:bg-[#1c1b18] rounded-xl"
                  >
                    <div>
                      <div class="text-xs text-[#78736a] dark:text-[#8c867c]">
                        Balance
                      </div>
                      <div class="text-lg font-bold">$${(yourKeyBalanceData
                        .balance / 100).toFixed(2)}</div>
                    </div>
                    <div class="flex gap-2">
                      <button
                        type="button"
                        class="${buttonClass("default", "sm")}"
                        @click="${onDeposit}"
                      >
                        Deposit
                      </button>
                      ${yourKeyBalanceData.balance > 0
                        ? html`
                          <button
                            type="button"
                            class="${buttonClass("secondary", "sm")}"
                            @click="${() =>
                              showToast(
                                "Please email support@aliceandbot.com to withdraw your funds.",
                              )}"
                          >
                            Withdraw
                          </button>
                        `
                        : nothing}
                    </div>
                  </div>
                `
                : nothing} ${yourKeyDepositData
                ? html`
                  <div
                    class="flex flex-col gap-2 p-4 bg-[#f6f4ee] dark:bg-[#1c1b18] rounded-xl"
                  >
                    <div class="font-semibold text-sm">Deposit Bitcoin</div>
                    <div class="text-xs text-[#66625b] dark:text-[#9c968c]">
                      Send <b>${yourKeyDepositData
                        .btcAmount} BTC</b> ($${yourKeyDepositData
                        .usdAmount}) to:
                    </div>
                    <div
                      class="font-mono text-xs break-all bg-white dark:bg-[#141412] p-2.5 rounded-lg border border-[#e7e4dc] dark:border-[#262521]"
                    >
                      ${yourKeyDepositData.address}
                    </div>
                    <img
                      src="${yourKeyDepositData.qrUrl}"
                      alt="Bitcoin QR Code"
                      class="w-40 h-40 mx-auto rounded-lg"
                    />
                    <button
                      type="button"
                      class="${buttonClass("secondary", "sm")}"
                      @click="${onCheckPayment}"
                    >
                      I've Paid
                    </button>
                    <button
                      type="button"
                      class="${buttonClass(
                        "link",
                        "sm",
                        "px-0 h-auto text-xs",
                      )}"
                      @click="${() => {
                        yourKeyDepositData = null;
                        stopDepositPolling();
                        rerenderChat();
                      }}"
                    >
                      Cancel
                    </button>
                  </div>
                `
                : nothing}
              <p class="text-[11px] text-[#78736a] dark:text-[#8c867c] leading-relaxed">
                Non-bank custodial credits; Bitcoin deposits are irreversible.
                See
                <a
                  href="${termsPath}"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="${legalLinkClass}"
                >Terms of Service</a>
                and
                <a
                  href="${privacyPath}"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="${legalLinkClass}"
                >Privacy Policy</a>.
              </p>
            </div>
          `
          : nothing}
      </div>

      ${dangerZone()}

      ${retentionNotice("text-xs pt-1")}

      <div
        class="flex items-center justify-center gap-3 pt-1 text-xs text-[#78736a] dark:text-[#8c867c]"
      >
        <a
          href="${privacyPath}"
          target="_blank"
          rel="noopener noreferrer"
          class="${legalLinkClass}"
        >Privacy Policy</a>
        <span>·</span>
        <a
          href="${termsPath}"
          target="_blank"
          rel="noopener noreferrer"
          class="${legalLinkClass}"
        >Terms of Service</a>
      </div>
    </div>
  `;
};

// --- Existing user form ---

// --- Existing user form ---

const stopQrScan = () => {
  loginIsScanningQr = false;
  if (qrScanAnimationId !== null) {
    cancelAnimationFrame(qrScanAnimationId);
    qrScanAnimationId = null;
  }
  if (qrScanStream) {
    qrScanStream.getTracks().forEach((track) => track.stop());
  }
  qrLoading = false;
  rerenderChat();
};

const scanQrFrame = () => {
  if (!loginIsScanningQr || !qrScanVideoElement) return;
  if (qrScanVideoElement.readyState === qrScanVideoElement.HAVE_ENOUGH_DATA) {
    const canvas = document.createElement("canvas");
    canvas.width = qrScanVideoElement.videoWidth;
    canvas.height = qrScanVideoElement.videoHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(qrScanVideoElement, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      (async () => {
        try {
          const jsqrDefault = (await import("jsqr")).default;
          const jsQR = typeof jsqrDefault === "function"
            ? jsqrDefault
            : jsqrDefault.default;
          const code = jsQR(
            imageData.data,
            imageData.width,
            imageData.height,
          );
          if (code) {
            const url = code.data;
            const match = url.match(/#transfer=([^:]+):(.+)$/);
            if (match) {
              stopQrScan();
              globalThis.location.hash = `transfer=${match[1]}:${match[2]}`;
              handleTransferImport().catch((e) =>
                console.error("Transfer import error", e)
              );
              return;
            }
          }
        } catch (e) {
          console.error("QR decoding error", e);
        }
      })();
    }
  }
  if (loginIsScanningQr) {
    qrScanAnimationId = requestAnimationFrame(scanQrFrame);
  }
};

const startQrScan = async () => {
  loginIsScanningQr = true;
  rerenderChat();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
    });
    qrScanStream = stream;
    setTimeout(() => {
      qrScanVideoElement = document.getElementById(
        "qr-video",
      ) as HTMLVideoElement;
      qrScanPreviewActive();
      rerenderChat();
    }, 100);
  } catch (e) {
    console.error("Error creating identity", e);
    showToast(
      "Failed to access camera. Please allow camera access or scan with your phone's built-in camera.",
      "error",
    );
    loginIsScanningQr = false;
    rerenderChat();
  }
};

const qrScanPreviewActive = () => {
  if (qrScanStream && qrScanVideoElement) {
    qrScanVideoElement.srcObject = qrScanStream;
    qrScanVideoElement.setAttribute("playsinline", "true");
    qrScanVideoElement.play().catch((_) => {});
    qrScanAnimationId = requestAnimationFrame(scanQrFrame);
    return true;
  }
  return false;
};

const existingUserForm = () => {
  const identify = () => {
    try {
      const creds = JSON.parse(loginExistingInput);
      setCredentials_(creds);
      if (loginStoreInBrowser) {
        try {
          localStorage.setItem("alicebot_credentials", loginExistingInput);
        } catch (e) {
          console.error("failed storing credentials in localStorage", e);
        }
      }
    } catch {
      showToast("Invalid credentials string", "error");
    }
  };
  // Autoplay handler for Lit element mounting
  setTimeout(qrScanPreviewActive, 150);

  return html`
    <div class="${sectionSpacing}">
      ${loginIsScanningQr
        ? html`
          <div class="flex flex-col gap-2">
            <div
              class="flex justify-center p-4 bg-white rounded-lg border border-gray-200 dark:border-gray-800"
            >
              <video
                id="qr-video"
                class="w-full max-w-sm aspect-square bg-black rounded-lg overflow-hidden object-cover"
                autoplay
                playsinline
              ></video>
            </div>
            <button type="button" class="${buttonClass(
              "secondary",
              "default",
              "w-full",
            )}" @click="${stopQrScan}">
              Cancel Scan
            </button>
            <div
              class="text-xs text-gray-500 dark:text-gray-400 text-center max-w-sm mt-2"
            >
              Point your camera at the QR code displayed on your other device.
            </div>
          </div>
        `
        : html`
          <label class="${labelStyle}">Paste your credentials</label>
          <div class="${inputRowStyle}">
            <input
              class="${inputStyle + " flex-1"}"
              placeholder="Paste credentials JSON"
              .value="${loginExistingInput}"
              @input="${(e: Event) => {
                loginExistingInput = (e.target as HTMLInputElement).value;
              }}"
            />
            <button type="button" class="${buttonClass(
              "default",
            )}" @click="${identify}">
              Sign in
            </button>
          </div>
          <div class="flex items-center mt-2">
            <input
              id="storeInBrowser2"
              type="checkbox"
              .checked="${loginStoreInBrowser}"
              @change="${(e: Event) => {
                loginStoreInBrowser = (e.target as HTMLInputElement).checked;
              }}"
              class="mr-2 accent-[#181715] dark:accent-[#f3f1ea]"
            />
            <label for="storeInBrowser2" class="${labelSmallStyle}">${storeCredentialsLabel}</label>
          </div>

          ${currentIsMobile
            ? html`
              <div class="w-full border-t border-[#e7e4dc] dark:border-[#262521] my-4"></div>
              <div class="flex flex-col gap-2">
                <button type="button" class="${buttonClass(
                  "secondary",
                  "default",
                  "w-full flex items-center justify-center gap-2",
                )}" @click="${startQrScan}">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke-width="2"
                    stroke="currentColor"
                    class="w-4 h-4"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"
                    />
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z"
                    />
                  </svg>
                  Scan Transfer QR
                </button>
                <p class="text-xs text-center text-[#78736a] dark:text-[#8c867c]">
                  On your other device: Settings → Connect another device
                </p>
              </div>
            `
            : html`
            `}
        `}
    </div>
  `;
};

// --- Messenger Login ---

const setCredentials_ = (creds: Credentials) => {
  credentials = creds;
  initLoggedInState();
  const params = new URLSearchParams(globalThis.location.search);
  params.delete("login");
  navigate(
    `${chatPath}${params.toString() ? `?${params.toString()}` : ""}`,
    true,
  );
  rerenderChat();
};

const messengerLogin = () => {
  const createIdentityWithName = async (name: string) => {
    if (!name.trim()) {
      showToast("Please enter a display name", "error");
      return;
    }
    loginCreatingIdentity = true;
    rerenderChat();
    try {
      const creds = await createIdentity(name.trim());
      if (loginStoreInBrowser) {
        try {
          localStorage.setItem("alicebot_credentials", JSON.stringify(creds));
        } catch (e) {
          console.error("failed storing credentials in localStorage", e);
        }
      }
      setCredentials_(creds);
    } catch (e) {
      console.error("Error creating identity", e);
      showToast("Unexpected error creating identity", "error");
    } finally {
      loginCreatingIdentity = false;
      rerenderChat();
    }
  };

  const goToExisting = () => {
    const params = new URLSearchParams(globalThis.location.search);
    params.set("login", "existing");
    navigate(`${chatPath}?${params.toString()}`);
    loginShowForm = "existing";
    rerenderChat();
  };

  // Sync login form from URL
  const q = currentQuery();
  const loginQ = q["login"] ?? "";
  if (loginQ === "existing" && loginShowForm !== "existing") {
    loginShowForm = "existing";
  }
  if (loginQ !== "existing" && loginShowForm === "existing") {
    loginShowForm = null;
  }

  const goToNewIdentity = () => {
    const params = new URLSearchParams(globalThis.location.search);
    params.delete("login");
    navigate(
      `${chatPath}${params.toString() ? `?${params.toString()}` : ""}`,
    );
    loginShowForm = null;
    rerenderChat();
  };

  return html`
    <div class="surface-dots flex flex-col flex-grow relative overflow-y-auto">
      <div class="flex items-center justify-between px-5 py-4">
        ${logoTemplate(goHome)}
        <button
          type="button"
          class="${buttonClass("ghost", "icon", "w-9 h-9")}"
          title="${currentDark
            ? "Switch to light mode"
            : "Switch to dark mode"}"
          @click="${toggleDark}"
        >
          ${currentDark ? sunSvg : moonSvg}
        </button>
      </div>
      ${loginShowForm === null
        ? html`
          <div
            class="flex flex-col items-center flex-grow justify-center text-center px-4 pb-12"
          >
            <div
              class="anim-rise w-full max-w-sm bg-white/90 dark:bg-[#151513]/95 backdrop-blur-xs border border-[#e7e4dc] dark:border-[#262521] rounded-3xl p-7 sm:p-8 shadow-[0_18px_45px_rgba(24,23,21,0.06)] dark:shadow-[0_18px_45px_rgba(0,0,0,0.45)] flex flex-col items-center gap-4"
            >
              <img
                src="/icon.png"
                alt="Alice&Bot"
                class="block dark:hidden w-12 h-12 anim-float object-contain"
              />
              <img
                src="/icon-dark.png"
                alt="Alice&Bot"
                class="hidden dark:block w-12 h-12 anim-float object-contain"
              />
              <div>
                <h1 class="text-xl font-bold tracking-tight">
                  What's your name?
                </h1>
                <p class="text-xs text-[#78736a] dark:text-[#8c867c] mt-1">
                  ${inviteContextLabel(q["chatWith"]) ??
                    "Local keypair · No email or phone"}
                </p>
              </div>
              <div class="w-full flex flex-col gap-3 mt-1">
                <input
                  class="${inputStyle + " w-full text-center"}"
                  placeholder="Display name"
                  .value="${loginDisplayName}"
                  @input="${(e: Event) => {
                    loginDisplayName = (e.target as HTMLInputElement).value;
                  }}"
                  @keydown="${(e: KeyboardEvent) => {
                    if (
                      e.key === "Enter" && loginDisplayName.trim()
                    ) createIdentityWithName(loginDisplayName);
                  }}"
                />
                <button
                  type="button"
                  class="${buttonClass("default", "default", "w-full h-11")}"
                  ?disabled="${loginCreatingIdentity}"
                  @click="${() => createIdentityWithName(loginDisplayName)}"
                >
                  ${loginCreatingIdentity ? "Creating..." : "Continue"}
                </button>
                <div class="flex items-center justify-center pt-0.5">
                  <input
                    id="storeInBrowser0"
                    type="checkbox"
                    .checked="${loginStoreInBrowser}"
                    @change="${(e: Event) => {
                      loginStoreInBrowser =
                        (e.target as HTMLInputElement).checked;
                    }}"
                    class="mr-2 accent-[#181715] dark:accent-[#f3f1ea]"
                  />
                  <label for="storeInBrowser0" class="${labelSmallStyle}">${storeCredentialsLabel}</label>
                </div>
              </div>
              <button type="button" class="${buttonClass(
                "link",
                "sm",
                "h-auto py-0 text-xs",
              )}" @click="${goToExisting}">
                I already have an account
              </button>
            </div>
            <p
              class="text-[11px] text-[#78736a] dark:text-[#8c867c] text-center mt-4 max-w-xs">
              By continuing, you agree to the
              <a
                href="${termsPath}"
                target="_blank"
                rel="noopener noreferrer"
                class="${legalLinkClass}"
              >Terms of Service</a>
              and
              <a
                href="${privacyPath}"
                target="_blank"
                rel="noopener noreferrer"
                class="${legalLinkClass}"
              >Privacy Policy</a>.
            </p>
            ${retentionNotice("text-[11px] mt-1.5 max-w-xs")}
          </div>
        `
        : html`
        `} ${loginShowForm === "existing"
        ? html`
          <div class="flex flex-col items-center flex-grow justify-center px-4 pb-12">
            <div
              class="anim-rise w-full max-w-md bg-white/90 dark:bg-[#151513]/95 backdrop-blur-xs border border-[#e7e4dc] dark:border-[#262521] rounded-3xl p-6 sm:p-7 shadow-[0_18px_45px_rgba(24,23,21,0.06)] dark:shadow-[0_18px_45px_rgba(0,0,0,0.45)]"
            >
              ${existingUserForm()}
              <div class="text-center">
                <button type="button" class="${buttonClass(
                  "link",
                  "sm",
                  "h-auto py-0 text-xs",
                )}" @click="${goToNewIdentity}">
                  ← Create new identity
                </button>
              </div>
            </div>
            <p
              class="text-[11px] text-[#78736a] dark:text-[#8c867c] text-center mt-4 max-w-xs">
              <a
                href="${privacyPath}"
                target="_blank"
                rel="noopener noreferrer"
                class="${legalLinkClass}"
              >Privacy Policy</a>
              ·
              <a
                href="${termsPath}"
                target="_blank"
                rel="noopener noreferrer"
                class="${legalLinkClass}"
              >Terms of Service</a>
            </p>
          </div>
        `
        : html`
        `}
    </div>
  `;
};

// --- Desktop sidebar ---

const desktopSidebar = () => {
  const { activeUnreadChats } = unreadSummary();
  const sidebarButtonClass = (v: View) =>
    `relative w-11 h-11 rounded-2xl font-bold transition-all duration-150 flex items-center justify-center ${
      view === v
        ? "bg-white text-[#181715] dark:bg-[#24231f] dark:text-[#f3f1ea] shadow-2xs"
        : "text-[#66625b] dark:text-[#9c968c] hover:bg-[#e9e5dc]/80 dark:hover:bg-[#1c1b18] hover:text-[#181715] dark:hover:text-[#f3f1ea]"
    }`;
  return html`
    <div
      class="w-16 border-r border-[#e5e1d6] dark:border-[#24231f] bg-[#f2efe8] dark:bg-[#111110] flex flex-col items-center py-5 gap-2.5 shrink-0 overflow-hidden"
    >
      <button
        type="button"
        class="${sidebarButtonClass("chats")}"
        @click="${() => setView_("chats")}"
        title="Messages"
      >
        ${chatIcon}
        ${activeUnreadChats > 0
          ? html`
            <span
              data-testid="nav-unread-badge"
              aria-label="${activeUnreadChats === 1
                ? "1 unread chat"
                : `${activeUnreadChats} unread chats`}"
              class="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[1.125rem] h-[1.125rem] px-1 rounded-full bg-[#2563eb] text-white dark:bg-[#60a5fa] dark:text-[#0d1526] text-[10px] font-bold leading-none tabular-nums ring-2 ring-[#f2efe8] dark:ring-[#111110]"
            >${formatUnreadBadgeLabel(activeUnreadChats)}</span>
          `
          : nothing}
      </button>
      <button
        type="button"
        class="${sidebarButtonClass("identity")}"
        @click="${() => setView_("identity")}"
        title="Settings"
      >
        ${settingsIcon}
      </button>
      <div class="flex-grow"></div>
      <button
        type="button"
        data-testid="shortcuts-button"
        class="${buttonClass("ghost", "icon", "w-11 h-11")}"
        title="${`Keyboard shortcuts (${
          isMacPlatform() ? "⌘/" : "Ctrl+/"
        } or ?)`}"
        aria-label="Keyboard shortcuts"
        @click="${() => {
          shortcutsModalOpen = !shortcutsModalOpen;
          rerenderChat();
        }}"
      >
        ${keyboardSvg}
      </button>
      <button
        type="button"
        class="${buttonClass("ghost", "icon", "w-11 h-11")}"
        title="${currentDark ? "Switch to light mode" : "Switch to dark mode"}"
        @click="${toggleDark}"
      >
        ${currentDark ? sunSvg : moonSvg}
      </button>
    </div>
  `;
};

// --- Chat panel (renders connected-chat custom element) ---

const closeConversation = () => {
  blurActiveInputOnMobile();
  view = "chats";
  selectedConversation = null;
  openChatUnreadBanner = null;
  syncUrlFromState();
  rerenderChat();
};

const handleNewThread = (newConversationId: string) => {
  selectConversation(newConversationId);
};

const handleChatWith = async (publicSignKey: string) => {
  if (!credentials || !conversations) return;
  const existing = conversations.find(
    isMatch(credentials.publicSignKey, publicSignKey),
  );
  if (existing) {
    selectConversation(existing.id);
    return;
  }
  try {
    const conversationId = await startConversation(credentials, publicSignKey);
    if (conversationId) {
      view = "chats";
      rerenderChat();
    }
  } catch (e) {
    console.error("Failed to start conversation with user", e);
  }
};

const installHeaderPillStyle =
  "px-3.5 py-1.5 text-xs font-semibold rounded-full bg-[#181715] text-[#faf9f5] hover:bg-[#2c2a26] dark:bg-[#f3f1ea] dark:text-[#181715] dark:hover:bg-white transition-colors";

const handleChatInstallClick = () => {
  triggerPwaInstall({ stayOnPage: true }).then((res) => {
    if (res === "ios-instructions") {
      showToast(
        "Tap Share → Add to Home Screen to install Alice&Bot",
        "success",
      );
    } else if (res === "browser-menu") {
      showToast(
        "Tap browser menu (⋮) → Install app / Add to Home screen",
        "success",
      );
    }
  });
};

const pushBannerContainerStyle =
  "flex items-center justify-between gap-2 px-3.5 py-2 text-xs border-b bg-[#efede6] text-[#181715] border-[#e2ded3] dark:bg-[#1b1a17] dark:text-[#f3f1ea] dark:border-[#292824] flex-shrink-0";
const pushBannerEnableBtnStyle =
  "px-3 py-1 rounded-full font-semibold bg-[#181715] text-[#faf9f5] hover:bg-[#2c2a26] dark:bg-[#f3f1ea] dark:text-[#181715] dark:hover:bg-white transition-colors";
const pushBannerDismissBtnStyle =
  "px-1.5 py-0.5 rounded-full text-[#66625b] hover:bg-black/6 dark:text-[#9c968c] dark:hover:bg-white/10 transition-colors";
const pushDismissStorageKey = "alicebot_push_dismissed";
const pushNudgeState = { triggered: false };

const isPushBannerDismissed = () => {
  try {
    return globalThis.localStorage?.getItem(pushDismissStorageKey) === "1";
  } catch {
    return false;
  }
};

const dismissPushBanner = () => {
  pushNudgeState.triggered = false;
  try {
    globalThis.localStorage?.setItem(pushDismissStorageKey, "1");
  } catch {
    // ignore storage errors
  }
  rerenderChat();
};

const formatPushError = (e: unknown) =>
  e instanceof Error && e.message
    ? e.message
    : "Failed to enable notifications";

const enablePushFromBanner = () => {
  if (!credentials) return;
  toastPromise(registerPush(credentials), {
    loading: "Enabling notifications\u2026",
    success: "Notifications enabled",
    error: formatPushError,
  }).then(() => {
    pushNudgeState.triggered = false;
    rerenderChat();
  }).catch(() => {
    rerenderChat();
  });
};

const pushPromptBanner = () => {
  if (!pushNudgeState.triggered || !credentials || isPushBannerDismissed()) {
    return nothing;
  }
  const canWebPush = "serviceWorker" in navigator &&
    "PushManager" in globalThis && "Notification" in globalThis;
  if (canWebPush && globalThis.Notification.permission === "default") {
    return html`
      <div class="${pushBannerContainerStyle}" data-testid="push-prompt-banner">
        <span>Get notified when replies arrive</span>
        <div class="flex items-center gap-1.5 flex-shrink-0">
          <button
            type="button"
            class="${pushBannerEnableBtnStyle}"
            @click="${enablePushFromBanner}"
          >
            Enable
          </button>
          <button
            type="button"
            class="${pushBannerDismissBtnStyle}"
            aria-label="Dismiss notification prompt"
            @click="${dismissPushBanner}"
          >
            ✕
          </button>
        </div>
      </div>
    `;
  }
  if (isIosDevice() && !isStandaloneApp() && !canWebPush) {
    return html`
      <div class="${pushBannerContainerStyle}" data-testid="ios-push-hint-banner">
        <span>Tap Share → Add to Home Screen to enable push notifications</span>
        <button
          type="button"
          class="${pushBannerDismissBtnStyle}"
          aria-label="Dismiss notification hint"
          @click="${dismissPushBanner}"
        >
          ✕
        </button>
      </div>
    `;
  }
  return nothing;
};

const chatPanelTemplate = () => {
  if (!credentials || !selectedConversation) {
    return html`
      <div class="surface-dots flex flex-col flex-grow min-h-0">
        ${emptyChatsView(undefined, () => setView_("new_chat"))}
      </div>
    `;
  }
  const activeConvId = selectedConversation;
  const otherUnreadCount = currentIsMobile
    ? (conversations ?? []).filter(
      (c) =>
        c.id !== activeConvId && !isArchived(c) && unreadStatusFor(c).isUnread,
    ).length
    : 0;
  return html`
    ${pushPromptBanner()}
    <alice-connected-chat
      style="${"display:flex;flex-direction:column;flex-grow:1;min-height:0"}"
      .credentials="${credentials}"
      .conversationId="${selectedConversation}"
      .initialConversation="${conversations?.find((c) =>
        c.id === selectedConversation
      ) ?? null}"
      .darkModeOverride="${currentDark}"
      .disableAutoFocus="${isMobileOrTouch()}"
      .onBack="${currentIsMobile ? closeConversation : undefined}"
      .onClose="${currentIsMobile ? undefined : closeConversation}"
      .onChatWith="${handleChatWith}"
      .onNewThread="${handleNewThread}"
      .enableVoiceCall="${true}"
      .unreadDividerAfterTimestamp="${openChatUnreadBanner?.conversationId ===
          selectedConversation
        ? openChatUnreadBanner.readAtBeforeOpen
        : undefined}"
      .otherUnreadCount="${otherUnreadCount}"
      @message-sent="${() => {
        if (selectedConversation) {
          markConversationAsRead(selectedConversation);
          if (openChatUnreadBanner?.conversationId === selectedConversation) {
            openChatUnreadBanner = null;
          }
        }
        if (!pushNudgeState.triggered && !isPushBannerDismissed()) {
          pushNudgeState.triggered = true;
        }
        rerenderChat();
      }}"
      @conversation-renamed="${(e: Event) => {
        const detail = (e as CustomEvent).detail as
          | { conversationId?: string; title?: string }
          | undefined;
        if (detail?.conversationId && detail?.title && conversations) {
          conversations = conversations.map((c) =>
            c.id === detail.conversationId ? { ...c, title: detail.title! } : c
          );
          rerenderChat();
        }
      }}"
    ></alice-connected-chat>
  `;
};

const renderChatPanel = (container: HTMLElement) => {
  container.style.cssText =
    "display:flex;flex-direction:column;flex-grow:1;min-height:0";
  render(chatPanelTemplate(), container);
};

// --- Mobile view ---

const mobileBottomNav = () => {
  const { activeUnreadChats } = unreadSummary();
  const btnClass = (v: View) =>
    `flex-1 px-3 py-2 rounded-full text-sm font-medium transition-colors inline-flex items-center justify-center gap-1.5 ${
      view === v
        ? "bg-[#181715] text-[#faf9f5] dark:bg-[#f3f1ea] dark:text-[#181715]"
        : "text-[#66625b] dark:text-[#9c968c] hover:bg-[#efede6] dark:hover:bg-[#1f1e1b]"
    }`;
  return html`
    <div
      class="border-t border-[#e5e1d6] dark:border-[#24231f] px-3 pt-2.5 bg-[#faf9f5] dark:bg-[#141412] flex items-center gap-1.5 flex-shrink-0"
      style="padding-bottom:calc(0.625rem + env(safe-area-inset-bottom, 0px))"
    >
      <button type="button" class="${btnClass("chats")}" @click="${() =>
        setView_("chats")}">
        <span>Chats</span>
        ${activeUnreadChats > 0
          ? html`
            <span
              data-testid="nav-unread-badge"
              aria-label="${activeUnreadChats === 1
                ? "1 unread chat"
                : `${activeUnreadChats} unread chats`}"
              class="${`inline-flex items-center justify-center min-w-[1.125rem] h-[1.125rem] px-1 rounded-full text-[10px] font-bold leading-none tabular-nums ${
                view === "chats"
                  ? "bg-[#2563eb] text-white"
                  : "bg-[#2563eb] text-white dark:bg-[#60a5fa] dark:text-[#0d1526]"
              }`}"
            >${formatUnreadBadgeLabel(activeUnreadChats)}</span>
          `
          : nothing}
      </button>
      <button type="button" class="${btnClass("new_chat")}" @click="${() =>
        setView_("new_chat")}">New</button>
      <button type="button" class="${btnClass("identity")}" @click="${() =>
        setView_("identity")}">
        Settings
      </button>
      <button
        type="button"
        class="p-2 rounded-full text-[#66625b] dark:text-[#9c968c] hover:bg-[#efede6] dark:hover:bg-[#1f1e1b] transition-colors"
        title="${currentDark ? "Switch to light mode" : "Switch to dark mode"}"
        @click="${toggleDark}"
      >
        ${currentDark ? sunSvg : moonSvg}
      </button>
    </div>
  `;
};

const mobileChatsListView = () => {
  const showChatsList = !selectedConversation;
  if (!showChatsList) {
    return html`
    `;
  }
  return html`
    <div
      class="flex flex-col w-full h-full overflow-hidden bg-[#faf9f5] dark:bg-[#141412]">
      ${view === "chats"
        ? html`
          <div
            class="px-4 pt-4 pb-2 bg-[#faf9f5] dark:bg-[#141412] flex items-center justify-between gap-2 flex-shrink-0"
          >
            ${logoTemplate(goHome)} ${canInstallPwa()
              ? html`
                <button
                  type="button"
                  class="${installHeaderPillStyle}"
                  @click="${handleChatInstallClick}"
                >
                  Install App
                </button>
              `
              : nothing}
          </div>
        `
        : html`
        `} ${view === "new_chat"
        ? html`
          <div
            class="px-4 py-3.5 border-b border-[#e5e1d6] dark:border-[#24231f] bg-[#faf9f5] dark:bg-[#141412] flex-shrink-0"
          >
            <h2 class="text-base font-semibold tracking-tight">New Chat</h2>
          </div>
        `
        : html`
        `} ${view === "identity"
        ? html`
          <div
            class="px-4 py-3.5 border-b border-[#e5e1d6] dark:border-[#24231f] bg-[#faf9f5] dark:bg-[#141412] flex-shrink-0"
          >
            <h2 class="text-base font-semibold tracking-tight">Settings</h2>
          </div>
        `
        : html`
        `} ${view === "chats"
        ? html`
          <div class="px-3 py-2 bg-[#faf9f5] dark:bg-[#141412] flex-shrink-0">
            <input
              type="text"
              placeholder="Search chats..."
              .value="${searchQuery}"
              @input="${(e: Event) => {
                searchQuery = (e.target as HTMLInputElement).value;
                syncPreviewTargets();
                rerenderChat();
              }}"
              class="w-full px-3.5 py-2 rounded-full bg-[#efede6] dark:bg-[#1e1d1a] text-[#181715] dark:text-[#f3f1ea] placeholder-[#8c867c] focus:outline-none focus:ring-2 focus:ring-[#39587f]/30 text-sm"
            />
          </div>
        `
        : html`
        `}
      <div
        class="flex-1 overflow-y-auto min-h-0 ${view === "chats"
          ? "bg-[#faf9f5] dark:bg-[#141412]"
          : "surface-dots"}"
        style="${scrollbarStyle()}"
      >
        ${view === "chats"
          ? openChats(searchQuery, () => setView_("new_chat"))
          : html`
          `} ${view === "new_chat"
          ? newChatScreen(() => setView_("chats"))
          : html`
          `} ${view === "identity"
          ? html`
            <div class="p-4">${yourKey()}</div>
          `
          : html`
          `}
      </div>
      ${view === "chats"
        ? html`
          <div
            class="py-2.5 px-3 border-t border-[#ece8df] dark:border-[#22211d] bg-[#faf9f5] dark:bg-[#141412] flex justify-center"
          >
            <button
              type="button"
              class="text-xs font-medium text-[#78736a] hover:text-[#181715] dark:hover:text-[#f3f1ea] transition-colors flex items-center gap-1.5"
              @click="${() => {
                showArchived = !showArchived;
                syncPreviewTargets();
                rerenderChat();
              }}"
            >
              ${showArchived ? "← Active Chats" : "Archived"}
              ${!showArchived && unreadSummary().archivedUnreadChats > 0
                ? html`
                  <span
                    data-testid="archived-unread-badge"
                    class="inline-flex items-center justify-center min-w-[1.125rem] h-[1.125rem] px-1 rounded-full bg-[#2563eb] text-white dark:bg-[#60a5fa] dark:text-[#0d1526] text-[10px] font-bold leading-none tabular-nums"
                  >${formatUnreadBadgeLabel(
                    unreadSummary().archivedUnreadChats,
                  )}</span>
                `
                : nothing}
            </button>
          </div>
        `
        : nothing} ${mobileBottomNav()}
    </div>
  `;
};

const mobileChatView = () => {
  if (!selectedConversation || view !== "chats") {
    return html`
    `;
  }
  return html`
    <div
      style="display:flex;flex-grow:1;flex-direction:column;width:100%;height:100%;min-height:0"
      id="mobile-chat-panel"
    ></div>
  `;
};

// --- Desktop view ---

const focusActiveComposer = () => {
  const el = document.querySelector("#desktop-chat-panel alice-connected-chat");
  if (el instanceof ConnectedChat) el.focusInput();
};

const scrollConversationItemIntoView = (convId: string) => {
  const item = document.querySelector(`[data-conversation-id="${convId}"]`);
  item?.scrollIntoView({ block: "nearest" });
};

const handleDesktopSearchKeydown = (e: KeyboardEvent) => {
  const list = visibleConversations(searchQuery);
  if (e.key === "ArrowDown") {
    if (list.length > 0) {
      e.preventDefault();
      searchHighlightIndex = (searchHighlightIndex + 1) % list.length;
      rerenderChat();
      scrollConversationItemIntoView(list[searchHighlightIndex].id);
    }
    return;
  }
  if (e.key === "ArrowUp") {
    if (list.length > 0) {
      e.preventDefault();
      searchHighlightIndex = (searchHighlightIndex - 1 + list.length) %
        list.length;
      rerenderChat();
      scrollConversationItemIntoView(list[searchHighlightIndex].id);
    }
    return;
  }
  if (e.key === "Enter") {
    const target = list[searchHighlightIndex] ?? list[0];
    if (target) {
      e.preventDefault();
      searchQuery = "";
      searchHighlightIndex = 0;
      searchInputFocused = false;
      syncPreviewTargets();
      selectConversation(target.id);
      requestAnimationFrame(() => {
        scrollConversationItemIntoView(target.id);
        focusActiveComposer();
      });
    }
    return;
  }
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    searchQuery = "";
    searchHighlightIndex = 0;
    searchInputFocused = false;
    syncPreviewTargets();
    if (e.target instanceof HTMLElement) e.target.blur();
    rerenderChat();
    focusActiveComposer();
  }
};

const desktopChatsView = () => {
  const searchHint = isMacPlatform() ? "⌘K" : "Ctrl K";
  return html`
    <div
      style="display:flex;flex:0 0 320px;flex-direction:column;overflow:hidden"
      class="border-r border-[#e5e1d6] dark:border-[#24231f] bg-[#faf9f5] dark:bg-[#141412]"
    >
      <div class="px-4 pt-4 pb-2">
        <div
          style="display:flex;align-items:center;gap:8px;justify-content:space-between"
        >
          <div style="display:flex;align-items:center">${logoTemplate(
            goHome,
          )}</div>
          <button
            type="button"
            class="w-9 h-9 flex items-center justify-center bg-[#eae7de] hover:bg-[#dfd9cc] dark:bg-[#24231f] dark:hover:bg-[#2e2d28] text-[#181715] dark:text-[#f3f1ea] rounded-full transition-colors flex-shrink-0"
            @click="${() => setView_("new_chat")}"
            title="New Chat"
          >
            ${newChatIcon}
          </button>
        </div>
      </div>
      <div class="px-3 py-2">
        <div class="relative">
          <input
            id="desktop-chat-search"
            data-testid="chat-search-input"
            type="text"
            placeholder="Search chats..."
            .value="${searchQuery}"
            @focus="${() => {
              searchInputFocused = true;
              searchHighlightIndex = 0;
              rerenderChat();
            }}"
            @blur="${() => {
              searchInputFocused = false;
              rerenderChat();
            }}"
            @input="${(e: Event) => {
              searchQuery = (e.target as HTMLInputElement).value;
              searchHighlightIndex = 0;
              syncPreviewTargets();
              rerenderChat();
            }}"
            @keydown="${handleDesktopSearchKeydown}"
            class="w-full pl-3.5 pr-14 py-2 rounded-full bg-[#efede6] dark:bg-[#1e1d1a] text-[#181715] dark:text-[#f3f1ea] placeholder-[#8c867c] focus:outline-none focus:ring-2 focus:ring-[#39587f]/30 text-sm"
          />
          ${!searchQuery
            ? html`
              <kbd
                class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-mono rounded bg-[#e5e1d6] dark:bg-[#2a2925] text-[#78736a] dark:text-[#9c968c]"
              >${searchHint}</kbd>
            `
            : nothing}
        </div>
      </div>
      <div
        style="display:flex;flex-grow:1;flex-direction:column;overflow-y:auto;padding-top:4px;${scrollbarStyle()}"
      >
        ${openChats(searchQuery, () => setView_("new_chat"))}
      </div>
      <div
        class="py-2.5 px-3 border-t border-[#ece8df] dark:border-[#22211d] flex justify-center"
      >
        <button
          type="button"
          class="text-xs font-medium text-[#78736a] hover:text-[#181715] dark:hover:text-[#f3f1ea] transition-colors flex items-center gap-1.5"
          @click="${() => {
            showArchived = !showArchived;
            syncPreviewTargets();
            rerenderChat();
          }}"
        >
          ${showArchived ? "← Active Chats" : "Archived"}
          ${!showArchived && unreadSummary().archivedUnreadChats > 0
            ? html`
              <span
                data-testid="archived-unread-badge"
                class="inline-flex items-center justify-center min-w-[1.125rem] h-[1.125rem] px-1 rounded-full bg-[#2563eb] text-white dark:bg-[#60a5fa] dark:text-[#0d1526] text-[10px] font-bold leading-none tabular-nums"
              >${formatUnreadBadgeLabel(
                unreadSummary().archivedUnreadChats,
              )}</span>
            `
            : nothing}
        </button>
      </div>
    </div>
  `;
};

const desktopContentArea = () => {
  if (view === "chats") {
    return html`
      ${desktopChatsView()}
      <div
        style="display:flex;flex:1 1 0;flex-direction:column;min-width:0;overflow:hidden"
        id="desktop-chat-panel"
      ></div>
    `;
  }
  if (view === "new_chat") {
    return html`
      <div style="display:flex;flex-grow:1;flex-direction:column"
        class="surface-dots">
        <div
          class="px-5 py-3.5 border-b border-[#e5e1d6] dark:border-[#24231f] bg-[#faf9f5] dark:bg-[#141412]"
        >
          <h2 class="text-base font-semibold tracking-tight">New Chat</h2>
        </div>
        <div
          class="p-4"
          style="display:flex;flex-grow:1;flex-direction:column;align-items:center;justify-content:center"
        >
          <div style="max-width:460px;width:100%">${newChatScreen(() =>
            setView_("chats")
          )}</div>
        </div>
      </div>
    `;
  }
  return html`
    <div style="display:flex;flex-grow:1;flex-direction:column"
      class="surface-dots">
      <div
        class="px-5 py-3.5 border-b border-[#e5e1d6] dark:border-[#24231f] bg-[#faf9f5] dark:bg-[#141412]"
      >
        <h2 class="text-base font-semibold tracking-tight">Settings</h2>
      </div>
      <div
        class="p-6 sm:p-8 overflow-y-auto"
        style="display:flex;flex-grow:1;flex-direction:column;align-items:center;justify-content:flex-start;${scrollbarStyle()}"
      >
        <div class="anim-rise" style="max-width:560px;width:100%">${yourKey()}</div>
      </div>
    </div>
  `;
};

// --- Logged-in messenger ---

const loggedInMessenger = () =>
  html`
    <div
      class="flex flex-row h-full w-full overflow-hidden"
      style="min-height:0;min-width:0"
    >
      ${!currentIsMobile ? desktopSidebar() : html`
      `} ${currentIsMobile
        ? html`
          ${mobileChatsListView()}${mobileChatView()}
        `
        : html`
        `} ${!currentIsMobile
        ? html`
          <div
            style="display:flex;flex-grow:1;flex-direction:row;min-width:0;overflow:hidden"
          >
            ${desktopContentArea()}
          </div>
        `
        : html`
        `}
    </div>
  `;

// --- Main template ---

const chatTemplate = (): TemplateResult =>
  html`
    <div class="${`flex flex-col w-full overflow-hidden ${textColorStyle}`}" style="height:var(--app-height, 100dvh)">
      ${!credentialsChecked
        ? html`
          <div style="display:flex;flex-grow:1;align-items:center;justify-content:center">
            ${spinner()}
          </div>
        `
        : html`
        `} ${credentialsChecked && !credentials ? messengerLogin() : html`
      `} ${credentialsChecked && credentials ? loggedInMessenger() : html`
      `} ${renameModalTemplate()} ${shortcutsModalTemplate()}
    </div>
  `;

const notificationAckState = { lastRemoteAckKey: "" };

const hasRegisteredPushSubscription = async (): Promise<boolean> => {
  if (globalThis.Notification?.permission !== "granted") return false;
  if (await defaultPushKeyStore.getPushEndpoint().catch(() => null)) {
    return true;
  }
  if (!("serviceWorker" in navigator)) return false;
  const reg = await navigator.serviceWorker.getRegistration().catch(() => null);
  const sub = await reg?.pushManager?.getSubscription().catch(() => null);
  return Boolean(sub?.endpoint);
};

const acknowledgeActiveConversation = (forceClearManual = false) => {
  if (!credentials || view !== "chats" || !selectedConversation) return;
  if (globalThis.document?.visibilityState === "hidden") return;
  const creds = credentials;
  const convId = selectedConversation;
  if (forceClearManual || !unreadState?.markedUnread[convId]) {
    markConversationAsRead(convId);
  }
  closeLocalNotificationsForConversation(convId).catch(() => {});
  if (globalThis.Notification?.permission !== "granted") return;
  const convUpdatedAt = conversations?.find((c) => c.id === convId)
    ?.updatedAt ?? 0;
  const ackKey = `${convId}:${convUpdatedAt}`;
  if (notificationAckState.lastRemoteAckKey === ackKey) return;
  hasRegisteredPushSubscription()
    .then((hasPush) => {
      if (!hasPush) return;
      if (
        selectedConversation !== convId ||
        notificationAckState.lastRemoteAckKey === ackKey
      ) {
        return;
      }
      notificationAckState.lastRemoteAckKey = ackKey;
      return dismissConversationNotifications(creds, convId);
    })
    .catch(() => {});
};

const onWindowFocusOrVisible = () => {
  if (globalThis.document?.visibilityState === "hidden") {
    blurActiveInputOnMobile();
    return;
  }
  acknowledgeActiveConversation(true);
  rerenderChat();
};

const onPageHide = () => {
  blurActiveInputOnMobile();
};

const onMessengerKeydown = (e: KeyboardEvent) => {
  if (e.defaultPrevented) return;
  if (e.key === "Escape") {
    if (shortcutsModalOpen) {
      e.preventDefault();
      closeShortcutsModal();
      return;
    }
    if (renameModalConvId) {
      e.preventDefault();
      closeRenameModal();
      return;
    }
    return;
  }
  if (!credentials || currentIsMobile) return;
  const action = classifyGlobalShortcut(e);
  if (!action) return;
  if (action.type === "toggle-shortcuts-help") {
    e.preventDefault();
    shortcutsModalOpen = !shortcutsModalOpen;
    rerenderChat();
    return;
  }
  if (action.type === "focus-search") {
    e.preventDefault();
    if (shortcutsModalOpen) shortcutsModalOpen = false;
    if (view !== "chats") {
      view = "chats";
      syncUrlFromState();
    }
    searchHighlightIndex = 0;
    rerenderChat();
    requestAnimationFrame(() => {
      const el = document.getElementById("desktop-chat-search");
      if (el instanceof HTMLInputElement) {
        el.focus();
        el.select();
      }
    });
    return;
  }
  if (action.type === "prev-thread" || action.type === "next-thread") {
    if (shortcutsModalOpen || renameModalConvId) return;
    if (view !== "chats") {
      view = "chats";
      syncUrlFromState();
    }
    const list = visibleConversations(searchQuery);
    const nextId = nextThreadId(
      list.map((c) => c.id),
      selectedConversation,
      action.type === "prev-thread" ? "prev" : "next",
    );
    if (nextId) {
      e.preventDefault();
      selectConversation(nextId);
      requestAnimationFrame(() => {
        scrollConversationItemIntoView(nextId);
        focusActiveComposer();
      });
    }
  }
};

const onServiceWorkerMessage = (event: MessageEvent) => {
  const data: unknown = event.data;
  if (typeof data !== "object" || data === null || !("type" in data)) return;
  if (
    data.type === "alice:select-conversation" &&
    "conversationId" in data &&
    typeof data.conversationId === "string"
  ) {
    view = "chats";
    selectConversation(data.conversationId);
    return;
  }
  if (
    data.type === "alice:mark-read" &&
    "conversationId" in data &&
    typeof data.conversationId === "string"
  ) {
    const readAt = "readAt" in data && typeof data.readAt === "number"
      ? data.readAt
      : Date.now();
    markConversationAsRead(data.conversationId, readAt);
    rerenderChat();
  }
};

// --- Init / teardown ---

const initLoggedInState = () => {
  if (!credentials) return;
  const activeCredentials = credentials;
  registerCredentials(activeCredentials);
  if (globalThis.localStorage?.getItem("alicebot_credentials")) {
    savePushCredentials(activeCredentials).catch(() => {});
  }
  unreadState = readUnreadState(activeCredentials.publicSignKey);
  if (unreadStorageUnsub) unreadStorageUnsub();
  unreadStorageUnsub = subscribeUnreadStateStorage(
    activeCredentials.publicSignKey,
    (next) => {
      unreadState = next;
      rerenderChat();
    },
  );
  const initialQueryConv = currentQuery()["c"];
  hintColdBootstrap(activeCredentials.publicSignKey, {
    includeConversations: true,
    ...(initialQueryConv ? { conversationId: initialQueryConv } : {}),
  });
  ensureInstantAuth(activeCredentials).catch(() => {});
  if (conversations === null) {
    conversations = readCachedConversations(activeCredentials.publicSignKey);
    if (conversations && !unreadState) {
      unreadState = seedUnreadState(
        null,
        activeCredentials.publicSignKey,
        conversations,
      );
      writeUnreadState(unreadState);
    }
  }
  if (previewsManager) previewsManager.unsubscribe();
  previewsManager = createConversationPreviewsManager(
    activeCredentials,
    (map) => {
      conversationPreviews = map;
      acknowledgeActiveConversation();
      rerenderChat();
    },
  );
  if (allTypingUnsub) allTypingUnsub();
  allTypingUnsub = subscribeAllTypingStates(
    activeCredentials,
    (map) => {
      typingByConversation = map;
      rerenderChat();
    },
  );
  syncPreviewTargets();
  if (conversationsUnsub) conversationsUnsub();
  conversationsUnsub = subscribeConversations(
    activeCredentials,
    (convs) => {
      if (convs === null && conversations !== null) return;
      conversations = convs;
      if (convs && !unreadState) {
        unreadState = seedUnreadState(
          null,
          activeCredentials.publicSignKey,
          convs,
        );
        writeUnreadState(unreadState);
      }
      writeCachedConversations(activeCredentials.publicSignKey, convs);
      convs?.forEach((conv) => {
        const other = conv.participants.find(
          (p) => p.publicSignKey !== activeCredentials.publicSignKey,
        );
        if (other && !conv.title && !other.name) {
          subscribeName(other.publicSignKey);
        }
      });
      syncPreviewTargets();
      acknowledgeActiveConversation();
      rerenderChat();
      handleChatWithInvite();
    },
  );
  subscribeYourKeyProfile(activeCredentials.publicSignKey);
  if (globalThis.Notification?.permission === "granted") {
    registerPush(activeCredentials).catch(() => {});
  }
};

const cleanup = () => {
  setActiveConversationGetter(null);
  syncFaviconDot(false);
  chatInitialized = false;
  chatContainer = null;
  if (viewportCleanup) {
    viewportCleanup();
    viewportCleanup = null;
  }
  if (overflowCleanup) {
    overflowCleanup();
    overflowCleanup = null;
  }
  if (conversationsUnsub) {
    conversationsUnsub();
    conversationsUnsub = null;
  }
  if (previewsManager) {
    previewsManager.unsubscribe();
    previewsManager = null;
  }
  if (allTypingUnsub) {
    allTypingUnsub();
    allTypingUnsub = null;
  }
  if (unreadStorageUnsub) {
    unreadStorageUnsub();
    unreadStorageUnsub = null;
  }
  conversationPreviews = {};
  typingByConversation = {};
  unreadState = null;
  openChatUnreadBanner = null;
  if (yourKeyProfileUnsub) {
    yourKeyProfileUnsub();
    yourKeyProfileUnsub = null;
  }
  stopDepositPolling();
  nameUnsubs.forEach((unsub) => unsub());
  nameUnsubs.clear();
  nameCache.clear();
  notificationAckState.lastRemoteAckKey = "";
  globalThis.removeEventListener("popstate", onPopstate);
  globalThis.removeEventListener("keydown", onMessengerKeydown);
  globalThis.removeEventListener("focus", onWindowFocusOrVisible);
  globalThis.removeEventListener("pagehide", onPageHide);
  globalThis.document?.removeEventListener(
    "visibilitychange",
    onWindowFocusOrVisible,
  );
  globalThis.navigator?.serviceWorker?.removeEventListener(
    "message",
    onServiceWorkerMessage,
  );
};

export const chat = (): TemplateResult => {
  cleanup();
  onRouteLeave(cleanup);

  // Reset state for fresh render
  credentialsChecked = false;
  credentials = null;
  selectedConversation = null;
  view = "chats";
  conversations = null;
  conversationPreviews = {};
  typingByConversation = {};
  searchQuery = "";
  shortcutsModalOpen = false;
  searchHighlightIndex = 0;
  searchInputFocused = false;
  initializedFromQuery = false;
  handledChatWith = null;
  chatWithInFlight = false;
  loginShowForm = null;
  loginDisplayName = "";
  loginCreatingIdentity = false;
  loginStoreInBrowser = true;
  loginExistingInput = "";
  newChatInput = "";
  paidInboxOpen = false;
  dangerZoneOpen = false;
  copiedPublicKey = false;
  qrDataUrl = null;
  qrTransferUrl = null;
  qrLoading = false;
  qrError = null;
  qrCopied = false;
  yourKeyProfile = null;
  yourKeyNameInput = "";
  yourKeyAliasInput = "";
  yourKeyBalanceData = null;
  yourKeyDepositData = null;
  yourKeyPriceTagInput = "0";
  transferImportInFlight = false;

  const id = "chat-mount";

  setTimeout(() => {
    chatContainer = document.getElementById(id);
    rerenderChat();

    // Load stored credentials
    try {
      const stored = localStorage.getItem("alicebot_credentials");
      if (stored) credentials = JSON.parse(stored);
    } catch (e) {
      console.error("Failed to parse stored credentials", e);
    }
    const hasTransfer = typeof globalThis.location !== "undefined" &&
      parseTransferFragment(globalThis.location.hash) !== null;
    if (!hasTransfer) {
      credentialsChecked = true;
    }

    // Init viewport + overflow
    viewportCleanup = initViewportHeightListener();
    overflowCleanup = lockOverflow();

    // Transfer import
    handleTransferImport().catch((e) =>
      console.error("Failed transfer import", e)
    );

    // URL popstate & notification focus/message sync
    setActiveConversationGetter(() =>
      view === "chats" ? selectedConversation : null
    );
    globalThis.addEventListener("popstate", onPopstate);
    globalThis.addEventListener("keydown", onMessengerKeydown);
    globalThis.addEventListener("focus", onWindowFocusOrVisible);
    globalThis.addEventListener("pagehide", onPageHide);
    globalThis.document?.addEventListener(
      "visibilitychange",
      onWindowFocusOrVisible,
    );
    globalThis.navigator?.serviceWorker?.addEventListener(
      "message",
      onServiceWorkerMessage,
    );

    // Init logged-in state if we have credentials
    if (credentials) {
      initLoggedInState();
      syncStateFromUrl();
    }

    chatInitialized = true;
    rerenderChat();
  });

  return html`
    <div id="${id}"></div>
  `;
};
