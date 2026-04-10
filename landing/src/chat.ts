import { html, render, type TemplateResult } from "lit";
import { aliasToPublicSignKey } from "../../backend/src/api.ts";
import "../../lit/components/connected-chat.ts";
import { buttonClass, copyableString } from "./components.ts";
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
import { registerPush, reportActive } from "../../protocol/src/pushClient.ts";
import { chatPath, homePath } from "./paths.ts";
import { currentQuery, navigate, onRouteLeave } from "./router.ts";
import { subscribeDarkMode } from "../../lit/core/dark-mode.ts";
import { setDarkModeOverride } from "../../lit/core/dark-mode.ts";
import { subscribeIsMobile } from "../../lit/core/responsive.ts";
import { accessAdminDb, accessDb } from "../../lit/core/instant-client.ts";
import {
  type Conversation,
  subscribeConversations,
  subscribeIdentityProfile,
  subscribeUserName,
} from "../../lit/core/subscriptions.ts";

// --- Styles ---

const textColorStyle = "text-gray-900 dark:text-gray-200";
const sectionSpacing = "mb-6";
const labelStyle =
  "block mb-2 text-sm font-medium text-gray-900 dark:text-gray-300";
const labelSmallStyle = "block text-xs text-gray-700 dark:text-gray-400";
const inputRowStyle = "flex gap-2 mb-2";
const inputStyle =
  "border px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#1a1a1a] border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-gray-500 focus:border-gray-500 dark:focus:ring-gray-500 dark:focus:border-gray-500 max-w-md";
const hintStyle = "text-xs text-gray-600 dark:text-gray-400 mt-1";
const tagline = "Encrypted chat for the AI era";
const storeCredentialsLabel = "This is my device, so store my credentials here";

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

type View = "chats" | "new_chat" | "identity";

let credentials: Credentials | null = null;
let credentialsChecked = false;
let selectedConversation: string | null = null;
let view: View = "chats";
let conversations: Conversation[] | null = null;
let searchQuery = "";
let initializedFromQuery = false;
let handledChatWith: string | null = null;
let chatWithInFlight = false;

let chatContainer: HTMLElement | null = null;
let viewportCleanup: (() => void) | null = null;
let overflowCleanup: (() => void) | null = null;
let conversationsUnsub: (() => void) | null = null;
let activeReportCleanup: (() => void) | null = null;

// Sub-component mutable state
let loginShowForm: null | "existing" = null;
let loginDisplayName = "";
let loginCreatingIdentity = false;
let loginStoreInBrowser = true;
let loginShowWhat = false;
let loginShowNoEmail = false;
let loginExistingInput = "";

let newChatInput = "";

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
let dangerZoneOpen = false;
let copiedCredentials = false;
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
    ? "#16a34a"
    : "#333";
  const el = Object.assign(document.createElement("div"), {
    textContent: message,
    style:
      `position:fixed;top:16px;left:50%;transform:translateX(-50%);background:${bg};color:#fff;padding:8px 20px;border-radius:8px;z-index:9999;font-size:14px;transition:opacity 0.3s`,
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

const db = accessDb();

const nameFromPublicSignKey = async (publicSignKey: string) => {
  const { data } = await db.queryOnce({
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
      const res = await aliasToPublicSignKey(token);
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
  const match = hash.match(/^#?transfer=([^:]+):(.+)$/);
  if (!match) return null;
  return { relayId: match[1], aesKey: base64UrlToBase64(match[2]) };
};

const handleTransferImport = async () => {
  if (typeof globalThis.location === "undefined") return;
  const parsed = parseTransferFragment(globalThis.location.hash);
  if (!parsed) return;
  globalThis.location.hash = "";
  const result = await retrieveTransferPayload(parsed.relayId);
  if ("error" in result) {
    showToast("Transfer link expired or already used", "error");
    return;
  }
  const creds = await decryptSymmetric<Credentials>(
    parsed.aesKey,
    result.encryptedPayload as EncryptedSymmetric<Credentials>,
  );
  localStorage.setItem("alicebot_credentials", JSON.stringify(creds));
  showToast("Credentials imported \u2014 reloading\u2026", "success");
  setTimeout(() => globalThis.location.reload(), 500);
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

const startActiveReporting = (creds: Credentials) => {
  const fire = () => reportActive(creds);
  const onVisibility = () => {
    if (document.visibilityState !== "visible") return;
    fire();
  };
  fire();
  const id = setInterval(fire, 30_000);
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    clearInterval(id);
    document.removeEventListener("visibilitychange", onVisibility);
  };
};

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
    if (!initializedFromQuery) initializedFromQuery = true;
    rerenderChat();
    return;
  }
  if (c) {
    if (view !== "chats") view = "chats";
    if (selectedConversation !== c) selectedConversation = c;
  } else {
    if (view !== "chats") view = "chats";
    if (selectedConversation !== null) selectedConversation = null;
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
    const res = await aliasToPublicSignKey(cw);
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
    conversationId = await startConversation(credentials, cw, topic);
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
    rerenderChat();
  });
  subscribeUserName(publicSignKey, (name) => {
    if (name !== null && yourKeyNameInput === "") yourKeyNameInput = name;
    rerenderChat();
  });
};

const fetchBalance = () => {
  if (!credentials) return;
  getBalanceAndTransactionsSigned(credentials).then((res) => {
    if (!("error" in res)) {
      yourKeyBalanceData = res;
      rerenderChat();
    }
  });
};

const startDepositPolling = () => {
  stopDepositPolling();
  if (!yourKeyDepositData || !credentials) return;
  const creds = credentials;
  const address = yourKeyDepositData.address;
  yourKeyDepositInterval = setInterval(async () => {
    const res = await checkCryptoPaymentSigned({
      paymentAddress: address,
      credentials: creds,
    });
    if (!("error" in res)) {
      showToast(res.message, "success");
      yourKeyDepositData = null;
      stopDepositPolling();
      fetchBalance();
      rerenderChat();
    }
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

const rerenderChat = () => {
  if (!chatContainer?.isConnected) return;
  render(chatTemplate(), chatContainer);
  requestAnimationFrame(mountChatPanels);
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
      <img src="/icon.png" alt="Alice&Bot" class="w-8 h-8" />
      <div class="text-left">
        <div class="text-sm font-semibold">Alice&Bot</div>
        <div class="text-xs text-gray-600 dark:text-gray-400">${tagline}</div>
      </div>
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

// --- Sub-templates ---

const setView_ = (v: View) => {
  view = v;
  syncUrlFromState();
  rerenderChat();
};

const selectConversation = (id: string) => {
  selectedConversation = id;
  const params = new URLSearchParams(globalThis.location.search);
  params.set("c", id);
  globalThis.history.pushState(null, "", `${chatPath}?${params.toString()}`);
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
  `scrollbar-color:${currentDark ? "#2a2a2a #0a0a0a" : "#d1d5db #f3f4f6"}`;

// --- Conversation list item ---

const conversationListItem = (conv: Conversation) => {
  if (!credentials) {
    return html`

    `;
  }
  const otherParticipant = conv.participants.find(
    (p) => p.publicSignKey !== credentials!.publicSignKey,
  );
  const otherKey = otherParticipant?.publicSignKey ?? "";
  const participantName = nameCache.get(otherKey) ?? null;
  const displayName = conv.title || participantName;
  const isSelected = selectedConversation === conv.id;
  return html`
    <li>
      <button type="button" class="${`w-full text-left px-4 py-3 flex items-center gap-3 border-b border-gray-300 dark:border-gray-700 transition-colors ${
        isSelected
          ? "bg-gray-100 dark:bg-black/50 border-l-4 border-l-gray-500"
          : "hover:bg-gray-50 dark:hover:bg-[#1a1a1a]/50"
      }`}" @click="${() => selectConversation(conv.id)}">
        ${displayName === null ? shimmerCircle() : chatAvatar({
          name: displayName,
          baseColor: avatarColor(otherKey, currentDark),
        })}
        <div class="flex-grow overflow-hidden min-w-0">
          <div class="${`font-medium ${textColorStyle} truncate`}">
            ${displayName === null ? shimmerText() : displayName}
          </div>
        </div>
      </button>
    </li>
  `;
};

// --- Empty chats ---

const emptyChatsView = (sq?: string, onNewChat?: () => void) => {
  const isEmpty = !sq?.trim();
  return html`
    <div
      style="display:flex;flex-direction:column;flex-grow:1;align-items:center;justify-content:center;padding:16px"
    >
      ${isEmpty
        ? html`
          <div class="mb-6 text-center">${logoTemplate()}</div>
          <button
            type="button"
            class="px-6 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-[#2a2a2a] dark:hover:bg-[#333] text-gray-800 dark:text-gray-200 rounded-lg font-medium transition-colors"
            @click="${onNewChat}"
          >
            + New Chat
          </button>
        `
        : html`
          <div class="text-gray-600 dark:text-gray-400">No matching chats</div>
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
  const filtered = sq?.trim()
    ? conversations.filter((conv) =>
      conv.title.toLowerCase().includes(sq.toLowerCase())
    )
    : conversations;
  return html`
    <div style="display:flex;flex-direction:column;flex-grow:1">
      ${filtered.length === 0 ? emptyChatsView(sq, onNewChat) : html`
        <ul class="flex flex-col">${filtered.map(conversationListItem)}</ul>
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
    startConversation(creds, newChatInput).then(() => {
      newChatInput = "";
      onChatCreated?.();
      rerenderChat();
    });
  return html`
    <div class="flex flex-col items-center px-4 py-8">
      <div class="w-full max-w-md">
        <div class="flex flex-col gap-3 mb-4">
          <input
            id="newChatInput"
            class="${inputStyle + " w-full"}"
            placeholder="Recipient @alias or public key"
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
          <div class="${hintStyle}">Use comma to add multiple recipients.</div>
          <div>
            <button type="button" class="${buttonClass()}" @click="${onStart}">
              Start New Conversation
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
};

// --- Copy invite link ---

const copyInviteLinkButton = (publicSignKey: string) => {
  const link = chatWithMeLink(publicSignKey);
  const onClick = () => {
    navigator.clipboard.writeText(link);
    showToast("Invite link copied!", "success");
  };
  return html`
    <div class="mb-4">
      <button type="button" class="${buttonClass(
        "secondary",
      )}" @click="${onClick}">
        Copy invite link
      </button>
      <div class="${hintStyle}">
        Share this link so others can start a chat with you.
      </div>
    </div>
  `;
};

// --- Copy credentials button ---

const copyCredentialsButton = () => {
  const onClick = () => {
    const creds = localStorage.getItem("alicebot_credentials");
    if (creds) {
      navigator.clipboard.writeText(creds);
      copiedCredentials = true;
      rerenderChat();
      setTimeout(() => {
        copiedCredentials = false;
        rerenderChat();
      }, 2000);
    }
  };
  return html`
    <div class="mb-4">
      <button type="button" class="${buttonClass(
        "secondary",
      )}" @click="${onClick}">
        Copy secret credentials ${copiedCredentials
          ? html`
            <span class="text-sm ml-1">Copied!</span>
          `
          : html`

          `}
      </button>
      <div class="${hintStyle}">
        Warning: Never share your credentials. Anyone with them has access to all
        your chats forever.
      </div>
    </div>
  `;
};

// --- Delete credentials ---

const deleteCredentialsButton = () =>
  html`
    <div class="mb-4">
      <button type="button" class="${buttonClass(
        "destructive",
      )}" @click="${() => {
        if (
          confirm(
            "Are you sure? If you delete your credentials from this browser, you will lose access unless you have saved them elsewhere.",
          )
        ) {
          localStorage.removeItem("alicebot_credentials");
          globalThis.location.reload();
        }
      }}">
        Delete credentials and sign out
      </button>
      <div class="${hintStyle}">
        Warning: Your key is not stored anywhere else. If you delete it and haven't
        saved it, you will lose access to your identity.
      </div>
    </div>
  `;

// --- Danger zone ---

const dangerZone = () =>
  html`
    <div
      class="mt-2 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 overflow-hidden"
    >
      <button type="button" class="${buttonClass(
        "ghost",
        "default",
        "w-full flex justify-between items-center py-2 px-3 text-left hover:bg-red-100/70 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300",
      )}" @click="${() => {
        dangerZoneOpen = !dangerZoneOpen;
        rerenderChat();
      }}">
        <span class="text-lg font-semibold text-red-700 dark:text-red-300"
        >Danger zone</span>
        <span class="ml-2 text-red-600/80 dark:text-red-300/80">${chevron(
          dangerZoneOpen,
        )}</span>
      </button>
      ${dangerZoneOpen
        ? html`
          <div class="px-3 py-2 border-t border-red-200 dark:border-red-800">
            ${copyCredentialsButton()}${deleteCredentialsButton()}
          </div>
        `
        : html`

        `}
    </div>
  `;

// --- QR code transfer ---

const qrCodeTransfer = () => {
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
  const onCopy = () => {
    if (!qrTransferUrl) return;
    navigator.clipboard.writeText(qrTransferUrl);
    qrCopied = true;
    rerenderChat();
  };
  return html`
    <div class="flex flex-col gap-2">
      <button
        type="button"
        class="${buttonClass("secondary", "default", "w-full")}"
        ?disabled="${qrLoading}"
        @click="${onGenerate}"
      >
        ${qrLoading
          ? "Generating..."
          : qrDataUrl
          ? "Regenerate QR code"
          : "Connect another device"}
      </button>
      <div class="${hintStyle}">
        Scan the QR code with your phone camera to sign in with the same identity.
        The code expires in 5 minutes and can only be used once.
      </div>
      ${qrError
        ? html`
          <div class="text-xs text-red-600 dark:text-red-400">${qrError}</div>
        `
        : html`

        `} ${qrDataUrl
        ? html`
          <div class="flex justify-center p-4 bg-white rounded-lg">
            <img src="${qrDataUrl}" alt="Transfer QR code" width="256" height="256" />
          </div>
        `
        : html`

        `} ${qrTransferUrl
        ? html`
          <div class="flex flex-col gap-1 items-center">
            <div class="${hintStyle}">No camera? Copy the link instead:</div>
            <button type="button" class="${buttonClass(
              "link",
              "sm",
              "px-0 h-auto text-xs",
            )}" @click="${onCopy}">
              ${qrCopied ? "Copied!" : "Copy link"}
            </button>
          </div>
        `
        : html`

        `}
    </div>
  `;
};

// --- YourKey (account settings) ---

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
  };

  const onCheckPayment = async () => {
    if (!yourKeyDepositData) return;
    showToast("Checking payment...");
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
  };

  const statusBadge = (
    status: { type: "success" | "error"; message: string } | null,
  ) =>
    status
      ? html`
        <div class="${`text-xs ${
          status.type === "success"
            ? "text-green-600 dark:text-green-400"
            : "text-red-600 dark:text-red-400"
        }`}">${status.message}</div>
      `
      : html`

      `;

  return html`
    <div style="display:flex;flex-direction:column" class="${textColorStyle} mb-2 gap-24">
      <!-- Profile -->
      <div class="space-y-4">
        <div
          class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide"
        >
          Profile
        </div>
        <div class="flex flex-col gap-1 max-w-md">
          <label class="${labelSmallStyle}">Display name</label>
          <div class="flex gap-2 items-center">
            <input
              class="${inputStyle + " flex-grow"}"
              placeholder="Your name"
              .value="${yourKeyNameInput}"
              @input="${(e: Event) => {
                yourKeyNameInput = (e.target as HTMLInputElement).value.slice(
                  0,
                  50,
                );
              }}"
              ?disabled="${yourKeySavingName}"
            />
            <button
              type="button"
              class="${buttonClass("default", "default", "w-24")}"
              ?disabled="${yourKeySavingName}"
              @click="${onSaveName}"
            >
              ${yourKeySavingName ? "Saving..." : "Save"}
            </button>
          </div>
          ${statusBadge(yourKeyNameStatus)}
        </div>
        <div class="flex flex-col gap-1 max-w-md">
          <label class="${labelSmallStyle}">Public alias (optional)</label>
          <div class="flex gap-2 items-center">
            <input
              class="${inputStyle + " flex-grow"}"
              placeholder="choose-alias"
              .value="${yourKeyAliasInput}"
              @input="${(e: Event) => {
                yourKeyAliasInput = (e.target as HTMLInputElement).value
                  .toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 15);
              }}"
              ?disabled="${yourKeySavingAlias}"
            />
            <button
              type="button"
              class="${buttonClass("default", "default", "w-24")}"
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
          <div class="${hintStyle}">
            Lowercase letters, numbers, underscore. Max 15 chars. Public &
            shareable.
          </div>
          ${statusBadge(yourKeyAliasStatus)} ${yourKeyProfile?.alias
            ? html`
              <div class="${hintStyle}">
                Current alias:&nbsp;<span class="font-mono">@${yourKeyProfile
                  .alias}</span>
              </div>
            `
            : html`

            `}
        </div>
      </div>

      <!-- Identity -->
      <div class="space-y-4">
        <div
          class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide"
        >
          Identity
        </div>
        <div>Your public key is ${copyableString(publicSignKey)}</div>
        <div>${copyInviteLinkButton(publicSignKey)}</div>
      </div>

      <!-- Wallet -->
      ${yourKeyBalanceData
        ? html`
          <div class="space-y-4">
            <div
              class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide"
            >
              Wallet
            </div>
            <div
              class="flex flex-row justify-between items-center p-4 bg-black/5 dark:bg-white/5 rounded-lg"
            >
              <div>
                <div class="font-semibold text-sm opacity-70">Account Balance</div>
                <div class="text-2xl font-bold">$${(yourKeyBalanceData.balance /
                  100).toFixed(2)}</div>
              </div>
              <div class="flex gap-2">
                <button type="button" class="${buttonClass()}" @click="${onDeposit}">
                  Deposit
                </button>
                ${yourKeyBalanceData.balance > 0
                  ? html`
                    <button type="button" class="${buttonClass()}" @click="${() =>
                      showToast(
                        "Please email support@aliceandbot.com to withdraw your funds.",
                      )}">Withdraw</button>
                  `
                  : html`

                  `}
              </div>
            </div>
            ${yourKeyDepositData
              ? html`
                <div class="flex flex-col gap-2 p-4 bg-black/5 dark:bg-white/5 rounded-lg">
                  <div class="font-semibold text-lg">Deposit Bitcoin</div>
                  <div class="text-sm">
                    Send exactly <b>${yourKeyDepositData
                      .btcAmount} BTC</b> ($${yourKeyDepositData
                      .usdAmount}) to the following address:
                  </div>
                  <div class="font-mono text-sm break-all bg-white dark:bg-black p-2 rounded">
                    ${yourKeyDepositData.address}
                  </div>
                  <img src="${yourKeyDepositData
                    .qrUrl}" alt="Bitcoin QR Code" class="w-48 h-48 mx-auto" />
                  <button type="button" class="${buttonClass(
                    "secondary",
                  )}" @click="${onCheckPayment}">
                    I've Paid (we check automatically)
                  </button>
                  <button type="button" class="${buttonClass(
                    "link",
                    "sm",
                    "px-0 h-auto text-sm opacity-70",
                  )}" @click="${() => {
                    yourKeyDepositData = null;
                    stopDepositPolling();
                    rerenderChat();
                  }}">Cancel</button>
                </div>
              `
              : html`

              `}
          </div>
        `
        : html`

        `}

      <!-- Monetization -->
      <div class="space-y-4">
        <div
          class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide"
        >
          Monetization
        </div>
        <div class="flex flex-col gap-2">
          <label class="font-bold text-sm text-gray-700 dark:text-gray-300"
          >Message Price (USD)</label>
          <div class="flex gap-2">
            <span class="self-center">$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              .value="${yourKeyPriceTagInput}"
              @input="${(e: Event) => {
                yourKeyPriceTagInput = (e.target as HTMLInputElement).value;
              }}"
              class="${inputStyle}"
              style="flex:1"
              placeholder="0.00"
            />
            <button
              type="button"
              class="${buttonClass()}"
              ?disabled="${yourKeySavingPrice}"
              @click="${onSavePrice}"
            >
              ${yourKeySavingPrice ? "Saving..." : "Save"}
            </button>
          </div>
          <div class="${hintStyle}">
            Cost for new users to start a conversation with you.
          </div>
          ${statusBadge(yourKeyPriceStatus)}
        </div>
      </div>

      <div>
        <button type="button" class="${buttonClass(
          "secondary",
          "default",
          "w-full",
        )}" @click="${() =>
          toastPromise(registerPush(credentials!), {
            loading: "Enabling notifications\u2026",
            success: "Notifications enabled",
            error: "Failed to enable notifications",
          })}">
          Enable push notifications
        </button>
      </div>

      ${qrCodeTransfer()} ${dangerZone()}
    </div>
  `;
};

// --- Existing user form ---

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
  return html`
    <div class="${sectionSpacing}">
      <label class="${labelStyle}">Paste your credentials string</label>
      <div class="${inputRowStyle}">
        <input
          class="${inputStyle}"
          placeholder="Paste credentials string here"
          .value="${loginExistingInput}"
          @input="${(e: Event) => {
            loginExistingInput = (e.target as HTMLInputElement).value;
          }}"
        />
        <button type="button" class="${buttonClass(
          "secondary",
        )}" @click="${identify}">
          Sign in
        </button>
      </div>
      <div class="flex items-center mt-1">
        <input
          id="storeInBrowser2"
          type="checkbox"
          .checked="${loginStoreInBrowser}"
          @change="${(e: Event) => {
            loginStoreInBrowser = (e.target as HTMLInputElement).checked;
          }}"
          class="mr-2"
        />
        <label for="storeInBrowser2" class="${labelSmallStyle}">${storeCredentialsLabel}</label>
      </div>
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

  return html`
    <div class="flex flex-col flex-grow">
      ${loginShowForm === null
        ? html`
          <div
            class="flex flex-col items-center gap-4 mb-6 flex-grow justify-center text-center px-4"
          >
            <div class="text-lg font-semibold max-w-xl">
              We don't know you yet. What's your name?
            </div>
            <div class="w-full max-w-md flex flex-col gap-3">
              <input
                class="${inputStyle}"
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
              <div class="flex items-center">
                <input
                  id="storeInBrowser0"
                  type="checkbox"
                  .checked="${loginStoreInBrowser}"
                  @change="${(e: Event) => {
                    loginStoreInBrowser =
                      (e.target as HTMLInputElement).checked;
                  }}"
                  class="mr-2"
                />
                <label for="storeInBrowser0" class="${labelSmallStyle}">${storeCredentialsLabel}</label>
              </div>
              <div class="flex justify-center">
                <button
                  type="button"
                  class="${buttonClass("default", "default", "px-8")}"
                  ?disabled="${loginCreatingIdentity}"
                  @click="${() => createIdentityWithName(loginDisplayName)}"
                >
                  ${loginCreatingIdentity ? "Creating..." : "Continue"}
                </button>
              </div>
              <button type="button" class="${buttonClass(
                "link",
                "sm",
              )}" @click="${goToExisting}">
                I already have an account
              </button>
            </div>
          </div>
          <div class="pt-2 self-center max-w-md w-full">
            <button
              type="button"
              class="w-full flex justify-between items-center py-2 px-3 rounded-md hover:bg-gray-100 dark:hover:bg-[#2a2a2a] text-left"
              @click="${() => {
                loginShowWhat = !loginShowWhat;
                rerenderChat();
              }}"
            >
              <span class="text-lg font-semibold">What is Alice&Bot?</span>
              <span class="ml-2 text-gray-500">${chevron(loginShowWhat)}</span>
            </button>
            ${loginShowWhat
              ? html`
                <div class="px-3 mt-2 text-base">
                  An end-to-end encrypted messenger for people and bots. Create a self-owned
                  cryptographic identity and chat using a public key or an @alias.
                </div>
              `
              : html`

              `}
            <div class="mt-3"></div>
            <button
              type="button"
              class="w-full flex justify-between items-center py-2 px-3 rounded-md hover:bg-gray-100 dark:hover:bg-[#2a2a2a] text-left"
              @click="${() => {
                loginShowNoEmail = !loginShowNoEmail;
                rerenderChat();
              }}"
            >
              <span class="text-lg font-semibold"
              >Do I need to give out my email or phone?</span>
              <span class="ml-2 text-gray-500">${chevron(
                loginShowNoEmail,
              )}</span>
            </button>
            ${loginShowNoEmail
              ? html`
                <div class="px-3 mt-2 text-base">
                  No. You create a self-owned identity right here\\u2014no email, phone number,
                  or personal info required. Your keys are generated locally in your browser.
                  You can keep the credentials in this browser or copy the credentials string to
                  store safely elsewhere.
                </div>
              `
              : html`

              `}
          </div>
        `
        : html`

        `} ${loginShowForm === "existing"
        ? html`
          <div class="flex flex-col items-center flex-grow justify-center px-4">
            <div class="w-full max-w-md">${existingUserForm()}</div>
          </div>
        `
        : html`

        `}
    </div>
  `;
};

// --- Desktop sidebar ---

const desktopSidebar = () => {
  const sidebarButtonClass = (v: View) =>
    `w-12 h-12 rounded-lg font-bold transition-colors flex items-center justify-center ${
      view === v
        ? "bg-gray-200 text-gray-800 dark:bg-[#2a2a2a] dark:text-gray-200"
        : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#1a1a1a]"
    }`;
  return html`
    <div
      class="w-20 border-r border-gray-300 dark:border-gray-700 bg-[#f8f7f4] dark:bg-[#111] flex flex-col items-center py-6 gap-4 shrink-0 overflow-hidden"
    >
      <button
        type="button"
        class="${sidebarButtonClass("chats")}"
        @click="${() => setView_("chats")}"
        title="Messages"
      >
        ${chatIcon}
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
        class="${buttonClass("ghost", "icon", "w-12 h-12")}"
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
  selectedConversation = null;
  syncUrlFromState();
  rerenderChat();
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
  const conversationId = await startConversation(credentials, publicSignKey);
  if (conversationId) {
    view = "chats";
    rerenderChat();
  }
};

const chatPanelTemplate = () => {
  if (!credentials || !selectedConversation) {
    return emptyChatsView(undefined, () => setView_("new_chat"));
  }
  return html`
    <alice-connected-chat
      style="${"display:flex;flex-direction:column;flex-grow:1;min-height:0"}"
      .credentials="${credentials}"
      .conversationId="${selectedConversation}"
      .darkModeOverride="${currentDark}"
      .onClose="${closeConversation}"
      .onChatWith="${handleChatWith}"
      .enableVoiceCall="${true}"
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
  const btnClass = (v: View) =>
    `flex-1 px-3 py-2 rounded-lg font-medium transition-colors ${
      view === v
        ? "bg-gray-200 text-gray-800 dark:bg-[#2a2a2a] dark:text-gray-200"
        : "bg-gray-100 dark:bg-[#141414] text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#2a2a2a]"
    }`;
  return html`
    <div
      class="border-t border-gray-300 dark:border-gray-700 p-4 bg-white dark:bg-black flex gap-2 flex-shrink-0"
    >
      <button type="button" class="${btnClass("chats")}" @click="${() =>
        setView_("chats")}">Chats</button>
      <button type="button" class="${btnClass("new_chat")}" @click="${() =>
        setView_("new_chat")}">New</button>
      <button type="button" class="${btnClass("identity")}" @click="${() =>
        setView_("identity")}">
        Settings
      </button>
      <button
        type="button"
        class="px-3 py-2 rounded-lg bg-gray-100 dark:bg-[#141414] text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#2a2a2a] transition-colors"
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
    <div class="flex flex-col w-full h-full overflow-hidden">
      ${view === "chats"
        ? html`
          <div class="p-4 bg-white dark:bg-black flex-shrink-0">${logoTemplate(
            goHome,
          )}</div>
        `
        : html`

        `} ${view === "new_chat"
        ? html`
          <div
            class="p-4 border-b border-gray-300 dark:border-gray-700 bg-white dark:bg-black flex-shrink-0"
          >
            <h2 class="text-lg font-semibold">Start a new chat</h2>
          </div>
        `
        : html`

        `} ${view === "identity"
        ? html`
          <div
            class="p-4 border-b border-gray-300 dark:border-gray-700 bg-white dark:bg-black flex-shrink-0"
          >
            <h2 class="text-lg font-semibold">Account Settings</h2>
          </div>
        `
        : html`

        `} ${view === "chats"
        ? html`
          <div class="p-3 bg-white dark:bg-black flex-shrink-0">
            <input
              type="text"
              placeholder="Search chats..."
              .value="${searchQuery}"
              @input="${(e: Event) => {
                searchQuery = (e.target as HTMLInputElement).value;
                rerenderChat();
              }}"
              class="w-full px-3 py-2 rounded-lg bg-gray-100 dark:bg-[#141414] text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 dark:focus:ring-gray-500 text-sm"
            />
          </div>
        `
        : html`

        `}
      <div
        class="flex-1 overflow-y-auto min-h-0 bg-white dark:bg-black"
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
      ${mobileBottomNav()}
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
    >
    </div>
  `;
};

// --- Desktop view ---

const desktopChatsView = () =>
  html`
    <div
      style="display:flex;flex:0 0 380px;flex-direction:column;overflow:hidden"
      class="border-r border-gray-300 dark:border-gray-700"
    >
      <div class="p-4 bg-white dark:bg-black">
        <div
          style="display:flex;align-items:flex-start;gap:8px;justify-content:space-between"
        >
          <div style="display:flex;align-items:center">${logoTemplate(
            goHome,
          )}</div>
          <button
            type="button"
            class="w-10 h-10 flex items-center justify-center bg-gray-200 hover:bg-gray-300 dark:bg-[#2a2a2a] dark:hover:bg-[#333] text-gray-800 dark:text-gray-200 rounded-lg transition-colors flex-shrink-0"
            @click="${() => setView_("new_chat")}"
            title="New Chat"
          >
            ${newChatIcon}
          </button>
        </div>
      </div>
      <div class="p-3 bg-white dark:bg-black">
        <input
          type="text"
          placeholder="Search chats..."
          .value="${searchQuery}"
          @input="${(e: Event) => {
            searchQuery = (e.target as HTMLInputElement).value;
            rerenderChat();
          }}"
          class="w-full px-3 py-2 rounded-lg bg-gray-100 dark:bg-[#141414] text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 dark:focus:ring-gray-500 text-sm"
        />
      </div>
      <div
        class="bg-white dark:bg-black"
        style="display:flex;flex-grow:1;flex-direction:column;overflow-y:auto;${scrollbarStyle()}"
      >
        ${openChats(searchQuery, () => setView_("new_chat"))}
      </div>
    </div>
  `;

const desktopContentArea = () => {
  if (view === "chats") {
    return html`
      ${desktopChatsView()}
      <div
        style="display:flex;flex:1 1 0;flex-direction:column;min-width:0;overflow:hidden"
        id="desktop-chat-panel"
      >
      </div>
    `;
  }
  if (view === "new_chat") {
    return html`
      <div style="display:flex;flex-grow:1;flex-direction:column">
        <div
          class="p-4 border-b border-gray-300 dark:border-gray-700 bg-white dark:bg-black"
        >
          <h2 class="text-lg font-semibold">Start a new chat</h2>
        </div>
        <div
          class="p-4 bg-white dark:bg-black"
          style="display:flex;flex-grow:1;flex-direction:column;align-items:center;justify-content:center"
        >
          <div style="max-width:500px;width:100%">${newChatScreen(() =>
            setView_("chats")
          )}</div>
        </div>
      </div>
    `;
  }
  return html`
    <div style="display:flex;flex-grow:1;flex-direction:column">
      <div
        class="p-4 border-b border-gray-300 dark:border-gray-700 bg-white dark:bg-black"
      >
        <h2 class="text-lg font-semibold">Account Settings</h2>
      </div>
      <div
        class="p-8 overflow-y-auto bg-white dark:bg-black"
        style="display:flex;flex-grow:1;flex-direction:column;align-items:center;justify-content:flex-start;${scrollbarStyle()}"
      >
        <div style="max-width:600px;width:100%">${yourKey()}</div>
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

      `}
    </div>
  `;

// --- Init / teardown ---

const initLoggedInState = () => {
  if (!credentials) return;
  // Subscribe to conversations
  if (conversationsUnsub) conversationsUnsub();
  conversationsUnsub = subscribeConversations(
    credentials.publicSignKey,
    (convs) => {
      conversations = convs;
      convs?.forEach((conv) => {
        const otherKey = conv.participants.find(
          (p) => p.publicSignKey !== credentials!.publicSignKey,
        )?.publicSignKey;
        if (otherKey) subscribeName(otherKey);
      });
      rerenderChat();
      handleChatWithInvite();
    },
  );
  // Subscribe to profile
  subscribeYourKeyProfile(credentials.publicSignKey);
  fetchBalance();
  // Active reporting
  if (activeReportCleanup) activeReportCleanup();
  activeReportCleanup = startActiveReporting(credentials);
};

const cleanup = () => {
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
  if (activeReportCleanup) {
    activeReportCleanup();
    activeReportCleanup = null;
  }
  if (yourKeyProfileUnsub) {
    yourKeyProfileUnsub();
    yourKeyProfileUnsub = null;
  }
  stopDepositPolling();
  nameUnsubs.forEach((unsub) => unsub());
  nameUnsubs.clear();
  nameCache.clear();
  globalThis.removeEventListener("popstate", onPopstate);
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
  searchQuery = "";
  initializedFromQuery = false;
  handledChatWith = null;
  chatWithInFlight = false;
  loginShowForm = null;
  loginDisplayName = "";
  loginCreatingIdentity = false;
  loginStoreInBrowser = true;
  loginExistingInput = "";
  newChatInput = "";
  dangerZoneOpen = false;
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
    credentialsChecked = true;

    // Init viewport + overflow
    viewportCleanup = initViewportHeightListener();
    overflowCleanup = lockOverflow();

    // Transfer import
    handleTransferImport();

    // URL popstate
    globalThis.addEventListener("popstate", onPopstate);

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
