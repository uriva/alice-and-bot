import { init as adminInit } from "@instantdb/admin";
import { init } from "@instantdb/react";
import { signal } from "@preact/signals";
import { FaMoon, FaSun } from "react-icons/fa";
import { Button } from "./components.tsx";
import { useLocation } from "preact-iso";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { toast } from "react-hot-toast";
import {
  type Conversation,
  useConversations,
  useDarkMode,
  useIdentityProfile,
  useIsMobile,
  useUserName,
} from "../..//clients/react/src/hooks.ts";
import { aliasToPublicSignKey } from "../../backend/src/api.ts";
import { ChatAvatar } from "../../clients/react/src/abstractChatBox.tsx";
import {
  avatarColor,
  ShimmerCircle,
  ShimmerText,
  Spinner,
} from "../../clients/react/src/design.tsx";
import { Chat as ChatNoDb } from "../../clients/react/src/main.tsx";
import schema from "../../instant.schema.ts";
import { normalizeAlias } from "../../protocol/src/alias.ts";
import {
  chatWithMeLink,
  checkCryptoPaymentSigned,
  createConversation,
  createIdentity,
  type Credentials,
  getBalanceAndTransactionsSigned,
  getProfile,
  instantAppId,
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
import { CopyableString } from "./components.tsx";
import { chatPath, homePath } from "./paths.ts";

const Chevron = ({ up }: { up: boolean }) => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 12 12"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    style={{ transform: up ? "rotate(180deg)" : undefined }}
  >
    <path d="M2 4l4 4 4-4" />
  </svg>
);

const db = init({ appId: instantAppId, schema, devtool: false });
const adminDb = adminInit({ appId: instantAppId, schema }).asUser({
  guest: true,
});

const nameFromPublicSignKey = async (publicSignKey: string) => {
  const { data } = await db.queryOnce({
    identities: { $: { where: { publicSignKey } } },
  });
  if (data.identities.length === 0) {
    console.error(
      `No identity found for public sign key: ${publicSignKey}`,
    );
    return publicSignKey;
  }
  return data.identities[0].name ?? publicSignKey;
};

const initialConversationId = () => {
  if (typeof globalThis.location === "undefined") return null;
  return new URLSearchParams(globalThis.location.search).get("c") ?? null;
};

const selectedConversation = signal<string | null>(initialConversationId());

const Chat = ChatNoDb(() => db);

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
  const viewport = globalThis.visualViewport;
  viewport?.addEventListener("resize", handler);
  viewport?.addEventListener("scroll", handler);
  globalThis.addEventListener("resize", handler);
  globalThis.addEventListener("orientationchange", handler);
  return () => {
    viewport?.removeEventListener("resize", handler);
    viewport?.removeEventListener("scroll", handler);
    globalThis.removeEventListener("resize", handler);
    globalThis.removeEventListener("orientationchange", handler);

    targets.forEach((el, i) => {
      const orig = originalStyles[i];
      el.style.height = orig.height;
      el.style.maxHeight = orig.maxHeight;
      el.style.minHeight = orig.minHeight;
      el.style.overflow = orig.overflow;
      if (orig.appHeight) {
        el.style.setProperty("--app-height", orig.appHeight);
      } else {
        el.style.removeProperty("--app-height");
      }
    });
  };
};

// Create a conversation with one or more other participants. Each token can be a
// public sign key or an alias. Comma separated list.
const startConversation = async (
  credentials: Credentials,
  rawInput: string,
  topic?: string,
): Promise<string | null> => {
  // Split by comma, trim, drop empties, strip @ prefix
  const tokens = rawInput.split(",").map((t) => t.trim().replace(/^@/, ""))
    .filter(Boolean);
  if (tokens.length === 0) {
    toast.error("Enter at least one @alias or public key");
    return null;
  }
  // Resolve each token: try alias lookup first; fallback to original (assume key)
  const resolved = await Promise.all(tokens.map(async (token) => {
    try {
      const res = await aliasToPublicSignKey(token);
      if ("publicSignKey" in res) return res.publicSignKey;
    } catch (_) {
      // network / other errors fall through to treat as key
    }
    return token; // assume it's already a public sign key
  }));
  // Include current user and dedupe
  const participantKeys = Array.from(
    new Set([
      credentials.publicSignKey,
      ...resolved.filter((k) => k !== credentials.publicSignKey),
    ]),
  );
  if (participantKeys.length < 2) {
    toast.error("Need at least one other participant");
    return null;
  }
  // Build title from names (fallback to key if missing)
  const names = await Promise.all(
    participantKeys.map((k) => nameFromPublicSignKey(k)),
  );
  const title = topic || names.join(", ");

  // Check for costs
  let totalCost = 0;
  for (const key of participantKeys) {
    if (key === credentials.publicSignKey) continue;
    const { profile } = await getProfile(key);
    if (profile?.priceTag) {
      totalCost += profile.priceTag;
    }
  }

  if (totalCost > 0) {
    const costInDollars = (totalCost / 100).toFixed(2);
    if (
      !globalThis.confirm(`This outreach will cost ${costInDollars}. Proceed?`)
    ) {
      return null;
    }
  }

  const response = await toast.promise(
    (async () => {
      const res = await createConversation(() => adminDb)(
        participantKeys,
        title,
        credentials,
      );
      if ("error" in res) throw new Error(res.error);
      return res;
    })(),
    {
      loading: "Creating conversation…",
      success: "Conversation created",
      error: (e) => `Failed to create conversation: ${e?.message ?? "error"}`,
    },
  );
  selectedConversation.value = response.conversationId;
  return response.conversationId;
};

const _NewUserForm = ({ onCreated, storeInBrowser, setStoreInBrowser }: {
  onCreated: (creds: Credentials) => void;
  storeInBrowser: boolean;
  setStoreInBrowser: (v: boolean) => void;
}) => {
  const [identityName, setIdentityName] = useState("");
  const [alias, setAliasInput] = useState("");
  const [credentialsString, setCredentialsString] = useState<string | null>(
    null,
  );
  const [creating, setCreating] = useState(false);
  const [aliasStatus, setAliasStatus] = useState<
    null | { type: "error" | "success"; message: string }
  >(null);

  const onClickCreateIdentity = async () => {
    if (!identityName.trim()) {
      toast.error("Please enter a display name");
      return;
    }
    const trimmedAlias = alias.trim().toLowerCase();
    if (!trimmedAlias) {
      toast.error("Please choose a public @alias");
      return;
    }
    // Front-end validation similar to server rules
    const normalized = trimmedAlias.replace(/[^a-z0-9_]/g, "").slice(0, 15);
    if (normalized !== trimmedAlias || normalized.length === 0) {
      toast.error("Alias: lowercase letters, numbers, underscore (max 15)");
      return;
    }
    setCreating(true);
    setAliasStatus(null);
    try {
      // Pre-check alias availability before creating identity
      try {
        const existing = await aliasToPublicSignKey(normalized);
        if ("publicSignKey" in existing) {
          setAliasStatus({
            type: "error",
            message: "Alias already taken. Please choose another.",
          });
          setCreating(false);
          return;
        }
      } catch (_e) {
        // Network hiccup, proceed with a warning toast
        toast("Alias availability check failed, attempting anyway…");
      }
      const creds = await toast.promise(
        createIdentity(identityName, normalized),
        {
          loading: "Creating identity…",
          success: "Identity created",
          error: "Failed to create identity",
        },
      );
      // Attempt to set alias immediately
      const res = await setAlias({ alias: normalized, credentials: creds });
      if (!res.success) {
        let message = "Failed to set alias";
        if (res.error === "alias-taken") message = "Alias already taken";
        if (res.error === "invalid-alias") message = "Invalid alias";
        if (res.error === "invalid-auth") message = "Auth failed";
        if (res.error === "not-found") message = "Identity not found";
        setAliasStatus({ type: "error", message });
        toast.error(message);
      } else {
        setAliasStatus({ type: "success", message: "Alias set" });
        toast.success("Alias set");
      }
      const credsStr = JSON.stringify(creds);
      setCredentialsString(credsStr);
      onCreated(creds);
      if (storeInBrowser) {
        try {
          localStorage.setItem("alicebot_credentials", credsStr);
        } catch (e) {
          console.error("failed storing credentials in localStorage", e);
        }
      }
    } catch (e) {
      console.error("Error creating identity", e);
      toast.error("Unexpected error creating identity");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div class={sectionSpacing}>
      <label class={labelStyle}>Create a new identity</label>
      <div
        style={{ display: "flex", flexDirection: "column" }}
        class={inputRowStyle}
      >
        <div>
          <input
            class={inputStyle}
            placeholder="Choose @alias"
            value={alias}
            onInput={(e) =>
              setAliasInput(normalizeAlias(e.currentTarget.value))}
          />
          <div class={hintStyle}>
            Your public handle/callsign/username.
          </div>
          <div class={hintStyle}>
            Use lowercase letters, numbers, underscore. Max 15 chars.
          </div>
          <div class={hintStyle}>
            You can change it later.
          </div>
          {aliasStatus && (
            <div
              class={`text-xs mt-1 ${
                aliasStatus.type === "error"
                  ? "text-red-600 dark:text-red-400"
                  : "text-green-600 dark:text-green-400"
              }`}
            >
              {aliasStatus.message}
            </div>
          )}
        </div>
        <div>
          <input
            class={inputStyle}
            placeholder="Display name"
            value={identityName}
            onInput={(e) => setIdentityName(e.currentTarget.value)}
          />
          <div class={hintStyle}>
            A display name that people will see in chats.
          </div>
          <div class={hintStyle}>
            You can change it later.
          </div>
        </div>
        <div>
          <Button
            variant="secondary"
            type="button"
            onClick={onClickCreateIdentity}
            disabled={creating}
          >
            {creating ? "Creating..." : "Sign up"}
          </Button>
          <div class={`${hintStyle} mt-1`}>No email or phone required.</div>
        </div>
      </div>
      <div class="flex items-center mb-2">
        <input
          id="storeInBrowser"
          type="checkbox"
          checked={storeInBrowser}
          onChange={(e) => setStoreInBrowser(e.currentTarget.checked)}
          class="mr-2"
        />
        <label for="storeInBrowser" class={labelSmallStyle}>
          {storeCredentialsLabel}
        </label>
      </div>
      {credentialsString && (
        <div class="mt-2">
          <label class={labelSmallStyle}>
            Save your credentials string:
          </label>
          <textarea
            class={textareaStyle}
            value={credentialsString}
            readOnly
            rows={3}
          />
          <div class={hintStyle}>
            Copy and save this string to identify as this user later.
          </div>
        </div>
      )}
    </div>
  );
};

const ExistingUserForm = ({ onIdentified, storeInBrowser, setStoreInBrowser }: {
  onIdentified: (creds: Credentials) => void;
  storeInBrowser: boolean;
  setStoreInBrowser: (v: boolean) => void;
}) => {
  const [inputCredentials, setInputCredentials] = useState("");

  const identify = () => {
    try {
      const creds = JSON.parse(inputCredentials);
      onIdentified(creds);
      if (storeInBrowser) {
        try {
          localStorage.setItem("alicebot_credentials", inputCredentials);
        } catch (e) {
          console.error("failed storing credentials in localStorage", e);
        }
      }
    } catch {
      toast.error("Invalid credentials string");
    }
  };

  return (
    <div class={sectionSpacing}>
      <label class={labelStyle}>
        Paste your credentials string
      </label>
      <div class={inputRowStyle}>
        <input
          class={inputStyle}
          placeholder="Paste credentials string here"
          value={inputCredentials}
          onInput={(e) => setInputCredentials(e.currentTarget.value)}
        />
        <Button variant="secondary" type="button" onClick={identify}>
          Sign in
        </Button>
      </div>
      <div class="flex items-center mt-1">
        <input
          id="storeInBrowser2"
          type="checkbox"
          checked={storeInBrowser}
          onChange={(e) => setStoreInBrowser(e.currentTarget.checked)}
          class="mr-2"
        />
        <label for="storeInBrowser2" class={labelSmallStyle}>
          {storeCredentialsLabel}
        </label>
      </div>
    </div>
  );
};

const generateTransferUrl = async (credentials: Credentials) => {
  const aesKey = await generateSymmetricKey();
  const encrypted = await encryptSymmetric(aesKey, credentials);
  const { relayId } = await storeTransferPayload(encrypted);
  const fragment = `transfer=${relayId}:${base64ToBase64Url(aesKey)}`;
  return `https://aliceandbot.com${chatPath}#${fragment}`;
};

const generateTransferQr = async (url: string) => {
  const QRCode = (await import("qrcode")).default;
  return QRCode.toDataURL(url, { width: 256, margin: 2 });
};

const QrCodeTransfer = ({ credentials }: { credentials: Credentials }) => {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [transferUrl, setTransferUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const onGenerate = async () => {
    setLoading(true);
    setError(null);
    setQrDataUrl(null);
    setTransferUrl(null);
    setCopied(false);
    try {
      const url = await generateTransferUrl(credentials);
      setTransferUrl(url);
      setQrDataUrl(await generateTransferQr(url));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate QR code");
    }
    setLoading(false);
  };

  const onCopy = () => {
    if (!transferUrl) return;
    navigator.clipboard.writeText(transferUrl);
    setCopied(true);
  };

  return (
    <div class="flex flex-col gap-2">
      <Button
        variant="secondary"
        type="button"
        disabled={loading}
        onClick={onGenerate}
      >
        {loading
          ? "Generating..."
          : qrDataUrl
          ? "Regenerate QR code"
          : "Connect another device"}
      </Button>
      <div class={hintStyle}>
        Scan the QR code with your phone camera to sign in with the same
        identity. The code expires in 5 minutes and can only be used once.
      </div>
      {error && (
        <div class="text-xs text-red-600 dark:text-red-400">{error}</div>
      )}
      {qrDataUrl && (
        <div class="flex justify-center p-4 bg-white rounded-lg">
          <img
            src={qrDataUrl}
            alt="Transfer QR code"
            width={256}
            height={256}
          />
        </div>
      )}
      {transferUrl && (
        <div class="flex flex-col gap-1 items-center">
          <div class={hintStyle}>No camera? Copy the link instead:</div>
          <Button
            variant="link"
            size="sm"
            type="button"
            className="px-0 h-auto text-xs"
            onClick={onCopy}
          >
            {copied ? "Copied!" : "Copy link"}
          </Button>
        </div>
      )}
    </div>
  );
};

const YourKey = ({ credentials }: { credentials: Credentials }) => {
  const publicSignKey = credentials.publicSignKey;
  const name = useUserName(() => db)(publicSignKey);
  const profile = useIdentityProfile(() => db)(publicSignKey);
  const [nameInput, setNameInput] = useState(name ?? "");
  const [aliasInput, setAliasInput] = useState(profile?.alias ?? "");
  const [savingName, setSavingName] = useState(false);
  const [savingAlias, setSavingAlias] = useState(false);
  const [nameStatus, setNameStatus] = useState<
    null | { type: "success" | "error"; message: string }
  >(null);
  const [aliasStatus, setAliasStatus] = useState<
    null | { type: "success" | "error"; message: string }
  >(null);

  const [priceTagInput, setPriceTagInput] = useState(
    profile?.priceTag ? (profile.priceTag / 100).toString() : "0",
  );
  const [savingPrice, setSavingPrice] = useState(false);
  const [priceStatus, setPriceStatus] = useState<
    null | { type: "success" | "error"; message: string }
  >(null);
  const [balanceData, setBalanceData] = useState<
    { balance: number; transactions: unknown[] } | null
  >(null);
  const [depositData, setDepositData] = useState<
    | { address: string; btcAmount: number; usdAmount: number; qrUrl: string }
    | null
  >(null);

  const fetchBalance = () => {
    getBalanceAndTransactionsSigned(credentials).then((res) => {
      if (!("error" in res)) {
        setBalanceData(res);
      }
    });
  };

  useEffect(() => {
    if (!depositData) return;

    let isCancelled = false;
    const interval = setInterval(async () => {
      const res = await checkCryptoPaymentSigned({
        paymentAddress: depositData.address,
        credentials,
      });
      if (isCancelled) return;

      if (!("error" in res)) {
        toast.success(res.message);
        setDepositData(null);
        fetchBalance();
      }
    }, 10000); // Check every 10 seconds

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [depositData, credentials]);

  useEffect(() => {
    fetchBalance();
  }, [credentials]);

  useEffect(() => {
    setPriceTagInput(
      profile?.priceTag ? (profile.priceTag / 100).toString() : "0",
    );
  }, [profile?.priceTag]);

  const onSavePrice = async () => {
    const val = parseFloat(priceTagInput);
    if (isNaN(val) || val < 0) {
      setPriceStatus({ type: "error", message: "Invalid price" });
      return;
    }
    setSavingPrice(true);
    setPriceStatus(null);
    // Convert USD to cents
    const priceTagCents = Math.round(val * 100);
    const res = await setPriceTagSigned({
      priceTag: priceTagCents,
      credentials,
    });
    setSavingPrice(false);
    if (res.success) {
      setPriceStatus({ type: "success", message: "Price saved" });
      setTimeout(() => setPriceStatus(null), 2000);
    } else {
      setPriceStatus({ type: "error", message: "Failed to save price" });
    }
  };
  useEffect(() => {
    setNameInput(name ?? "");
  }, [name]);
  useEffect(() => {
    setAliasInput(profile?.alias ?? "");
  }, [profile?.alias]);

  const onSaveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setNameStatus({ type: "error", message: "Name can't be empty" });
      return;
    }
    setSavingName(true);
    setNameStatus(null);
    const res = await setName({ name: trimmed, credentials });
    setSavingName(false);
    if (res.success) {
      setNameStatus({ type: "success", message: "Name saved" });
      setTimeout(() => setNameStatus(null), 2000);
    } else {
      const message = res.error === "invalid-name"
        ? "Invalid name (max 50 characters)"
        : res.error === "not-found"
        ? "Identity not found"
        : "Authentication failed";
      setNameStatus({ type: "error", message });
    }
  };

  const onSaveAlias = async () => {
    const trimmed = aliasInput.trim();
    if (!trimmed) {
      setAliasStatus({ type: "error", message: "Alias can't be empty" });
      return;
    }
    setSavingAlias(true);
    setAliasStatus(null);
    const res = await setAlias({ alias: trimmed, credentials });
    setSavingAlias(false);
    if (res.success) {
      setAliasStatus({ type: "success", message: "Alias saved" });
      setAliasInput(
        trimmed.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 15),
      );
      setTimeout(() => setAliasStatus(null), 2000);
    } else {
      let message = "Failed to set alias";
      if (res.error === "alias-taken") message = "Alias already taken";
      if (res.error === "invalid-alias") message = "Invalid alias";
      if (res.error === "not-found") message = "Identity not found";
      if (res.error === "invalid-auth") message = "Authentication failed";
      setAliasStatus({ type: "error", message });
    }
  };

  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
      class={`${textColorStyle} mb-2`}
    >
      <div class="flex flex-col gap-1 max-w-md">
        <label class={labelSmallStyle}>Display name</label>
        <div class="flex gap-2 items-center">
          <input
            class={inputStyle + " flex-grow"}
            placeholder="Your name"
            value={nameInput}
            onInput={(e) => setNameInput(e.currentTarget.value.slice(0, 50))}
            disabled={savingName}
          />
          <Button
            type="button"
            disabled={savingName || nameInput.trim() === (name ?? "")}
            onClick={onSaveName}
          >
            {savingName ? "Saving..." : "Save"}
          </Button>
        </div>
        {nameStatus && (
          <div
            class={`text-xs ${
              nameStatus.type === "success"
                ? "text-green-600 dark:text-green-400"
                : "text-red-600 dark:text-red-400"
            }`}
          >
            {nameStatus.message}
          </div>
        )}
      </div>
      <div>
        Your public key is <CopyableString str={publicSignKey} />
      </div>
      <div>
        <CopyInviteLinkButton publicSignKey={publicSignKey} />
      </div>
      <div class="flex flex-col gap-1 max-w-md">
        <label class={labelSmallStyle}>Public alias (optional)</label>
        <div class="flex gap-2 items-center">
          <input
            class={inputStyle + " flex-grow"}
            placeholder="choose-alias"
            value={aliasInput}
            onInput={(e) =>
              setAliasInput(
                e.currentTarget.value.toLowerCase().replace(/[^a-z0-9_]/g, "")
                  .slice(0, 15),
              )}
            disabled={savingAlias}
          />
          <Button
            type="button"
            disabled={savingAlias}
            onClick={onSaveAlias}
          >
            {savingAlias ? "Saving..." : profile?.alias ? "Update" : "Set"}{" "}
            alias
          </Button>
        </div>
        <div class={hintStyle}>
          Lowercase letters, numbers, underscore. Max 15 chars. Public &
          shareable.
        </div>
        {aliasStatus && (
          <div
            class={`text-xs ${
              aliasStatus.type === "success"
                ? "text-green-600 dark:text-green-400"
                : "text-red-600 dark:text-red-400"
            }`}
          >
            {aliasStatus.message}
          </div>
        )}
        {profile?.alias && (
          <div class={hintStyle}>
            Current alias:&nbsp;
            <span class="font-mono">@{profile.alias}</span>
          </div>
        )}
      </div>

      {/* Balance Display */}
      {balanceData && (
        <div class="flex flex-row justify-between items-center p-4 bg-black/5 dark:bg-white/5 rounded-lg mb-2">
          <div>
            <div class="font-semibold text-sm opacity-70">Account Balance</div>
            <div class="text-2xl font-bold">
              ${(balanceData.balance / 100).toFixed(2)}
            </div>
          </div>
          <div class="flex gap-2">
            <Button
              type="button"
              onClick={async () => {
                const amountStr = globalThis.prompt(
                  "Enter amount to deposit (USD)",
                  "10",
                );
                if (!amountStr) return;
                const amount = parseFloat(amountStr);
                if (isNaN(amount) || amount <= 0) {
                  toast("Invalid amount");
                  return;
                }
                const toastId = toast.loading("Generating deposit address...");
                const res = await prepareCryptoPaymentSigned({
                  amount,
                  credentials,
                });
                toast.dismiss(toastId);
                if ("error" in res) {
                  toast.error(`Failed: ${res.error}`);
                } else {
                  setDepositData(res);
                }
              }}
            >
              Deposit
            </Button>
            {balanceData.balance > 0 && (
              <Button
                variant="secondary"
                type="button"
                onClick={() =>
                  toast(
                    "Please email support@aliceandbot.com to withdraw your funds.",
                  )}
              >
                Withdraw
              </Button>
            )}
          </div>
        </div>
      )}

      {depositData && (
        <div class="flex flex-col gap-2 mb-4 p-4 bg-black/5 dark:bg-white/5 rounded-lg">
          <div class="font-semibold text-lg">Deposit Bitcoin</div>
          <div class="text-sm">
            Send exactly <b>{depositData.btcAmount} BTC</b>{" "}
            (${depositData.usdAmount}) to the following address:
          </div>
          <div class="font-mono text-sm break-all bg-white dark:bg-black p-2 rounded">
            {depositData.address}
          </div>
          <img
            src={depositData.qrUrl}
            alt="Bitcoin QR Code"
            class="w-48 h-48 mx-auto"
          />
          <Button
            variant="secondary"
            type="button"
            onClick={async () => {
              const toastId = toast.loading("Checking payment...");
              const res = await checkCryptoPaymentSigned({
                paymentAddress: depositData.address,
                credentials,
              });
              toast.dismiss(toastId);
              if ("error" in res) {
                toast.error(
                  res.error === "not-paid"
                    ? "Payment not found yet. We are checking automatically."
                    : `Failed: ${res.error}`,
                );
              } else {
                toast.success(res.message);
                setDepositData(null);
                fetchBalance();
              }
            }}
          >
            I've Paid (we check automatically)
          </Button>
          <Button
            variant="link"
            size="sm"
            type="button"
            className="px-0 h-auto text-sm opacity-70"
            onClick={() => setDepositData(null)}
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Price Tag Setting */}
      <div class="flex flex-col gap-2 mb-4">
        <label class="font-bold text-sm text-gray-700 dark:text-gray-300">
          Message Price (USD)
        </label>
        <div class="flex gap-2">
          <span class="self-center">$</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={priceTagInput}
            onInput={(e) => setPriceTagInput(e.currentTarget.value)}
            class={inputStyle}
            style={{ flex: 1 }}
            placeholder="0.00"
          />
          <Button
            type="button"
            onClick={onSavePrice}
            disabled={savingPrice}
          >
            {savingPrice ? "Saving..." : "Save"}
          </Button>
        </div>
        <div class={hintStyle}>
          Cost for new users to start a conversation with you.
        </div>
        {priceStatus && (
          <div
            class={`text-xs ${
              priceStatus.type === "success"
                ? "text-green-600 dark:text-green-400"
                : "text-red-600 dark:text-red-400"
            }`}
          >
            {priceStatus.message}
          </div>
        )}
      </div>
      <div>
        <Button
          variant="secondary"
          type="button"
          onClick={() => {
            toast.promise(
              registerPush(credentials),
              {
                loading: "Enabling notifications…",
                success: "Notifications enabled",
                error: "Failed to enable notifications",
              },
            );
          }}
        >
          Enable push notifications
        </Button>
      </div>
      <QrCodeTransfer credentials={credentials} />
      <DangerZone />
    </div>
  );
};

const ConversationListItem = (
  { conv, credentials }: { conv: Conversation; credentials: Credentials },
) => {
  const otherParticipant = conv.participants.find((p) =>
    p.publicSignKey !== credentials.publicSignKey
  );
  const participantName = useUserName(() => db)(
    otherParticipant?.publicSignKey ?? "",
  );
  const displayName = conv.title || participantName;
  const isDarkMode = useDarkMode();
  return (
    <li key={conv.id}>
      <button
        type="button"
        class={`w-full text-left px-4 py-3 flex items-center gap-3 border-b border-gray-200 dark:border-gray-700 transition-colors ${
          selectedConversation.value === conv.id
            ? "bg-gray-100 dark:bg-gray-800/50 border-l-4 border-l-gray-500"
            : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
        }`}
        onClick={() => {
          selectedConversation.value = conv.id;
        }}
      >
        {displayName === null ? <ShimmerCircle /> : (
          <ChatAvatar
            name={displayName}
            baseColor={avatarColor(
              otherParticipant?.publicSignKey ?? "",
              isDarkMode,
            )}
          />
        )}
        <div class="flex-grow overflow-hidden min-w-0">
          <div class={`font-medium ${textColorStyle} truncate`}>
            {displayName === null ? <ShimmerText /> : displayName}
          </div>
        </div>
      </button>
    </li>
  );
};

const EmptyChatsView = ({ searchQuery, onNewChat }: {
  searchQuery?: string;
  onNewChat?: () => void;
}) => {
  const isEmpty = !searchQuery?.trim();
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flexGrow: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      {isEmpty && (
        <>
          <div class="mb-6 text-center">
            <Logo />
          </div>
          <button
            type="button"
            class="px-6 py-2 bg-gray-800 hover:bg-gray-900 dark:bg-gray-300 dark:hover:bg-gray-400 text-white dark:text-gray-900 rounded-lg font-medium transition-colors"
            onClick={onNewChat}
          >
            + New Chat
          </button>
        </>
      )}
      {!isEmpty && (
        <div class="text-gray-600 dark:text-gray-400">
          No matching chats
        </div>
      )}
    </div>
  );
};

const OpenChats = (
  { credentials, searchQuery, onNewChat }: {
    credentials: Credentials | null;
    searchQuery?: string;
    onNewChat?: () => void;
  },
) => {
  const conversations = useConversations(() => db)(
    credentials?.publicSignKey ?? "",
  );

  const isLoading = conversations === null;

  const filtered = searchQuery?.trim()
    ? (conversations ?? []).filter((conv) =>
      conv.title.toLowerCase().includes(searchQuery.toLowerCase())
    )
    : (conversations ?? []);

  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Spinner />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>
      {filtered.length === 0
        ? <EmptyChatsView searchQuery={searchQuery} onNewChat={onNewChat} />
        : (
          <ul class="flex flex-col">
            {filtered.map((conv) => (
              <ConversationListItem
                key={conv.id}
                conv={conv}
                credentials={credentials!}
              />
            ))}
          </ul>
        )}
    </div>
  );
};

const _Nav = (
  { view, setView }: { view: View; setView: (view: View) => void },
) => {
  return (
    <nav class="flex space-x-4 mb-4">
      <Button
        variant={view === "chats" ? "default" : "ghost"}
        size="sm"
        onClick={() => setView("chats")}
      >
        Open Chats
      </Button>
      <Button
        variant={view === "new_chat" ? "default" : "ghost"}
        size="sm"
        onClick={() => setView("new_chat")}
      >
        New chat
      </Button>
      <Button
        variant={view === "identity" ? "default" : "ghost"}
        size="sm"
        onClick={() => setView("identity")}
      >
        Account
      </Button>
    </nav>
  );
};

const NewChatScreen = (
  { credentials, onChatCreated }: {
    credentials: Credentials;
    onChatCreated?: () => void;
  },
) => {
  const [otherParticipantPubKey, setOtherParticipantPubKey] = useState("");
  return (
    <div class="flex flex-col items-center px-4 py-8">
      <div class="w-full max-w-md">
        <div class="flex flex-col gap-3 mb-4">
          <input
            id="newChatInput"
            class={inputStyle + " w-full"}
            placeholder="Recipient @alias or public key"
            value={otherParticipantPubKey}
            autoFocus
            aria-label="Recipient alias or public key"
            onInput={(e) => {
              setOtherParticipantPubKey(e.currentTarget.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                startConversation(credentials, otherParticipantPubKey).then(
                  () => onChatCreated?.(),
                );
              }
            }}
          />
          <div class={hintStyle}>Use comma to add multiple recipients.</div>
          <div>
            <Button
              type="button"
              onClick={() =>
                startConversation(credentials, otherParticipantPubKey).then(
                  () => onChatCreated?.(),
                )}
            >
              Start New Conversation
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
const tagline = "Encrypted chat for the AI era";
const storeCredentialsLabel = "This is my device, so store my credentials here";

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

type View = "chats" | "new_chat" | "identity";

const Logo = ({ onClick }: { onClick?: () => void }) => {
  const content = (
    <div class="flex items-center gap-2">
      <img
        src="/icon.png"
        alt="Alice&Bot"
        class="w-8 h-8"
      />
      <div>
        <div class="text-sm font-semibold">Alice&Bot</div>
        <div class="text-xs text-gray-600 dark:text-gray-400">
          {tagline}
        </div>
      </div>
    </div>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        class="hover:opacity-80 transition-opacity cursor-pointer"
      >
        {content}
      </button>
    );
  }

  return content;
};

const LogoHeader = ({ onClick }: { onClick?: () => void }) => (
  <Logo onClick={onClick} />
);

const LoggedInMessenger = (
  { view, setView, credentials }: {
    view: View;
    setView: (view: View) => void;
    credentials: Credentials;
  },
) => {
  const isMobile = useIsMobile();
  const isDark = useDarkMode();
  const [darkModeState, setDarkModeState] = useState(isDark);
  const scrollbarStyle = {
    scrollbarColor: isDark ? "#374151 #111827" : "#d1d5db #f3f4f6",
  };
  const [searchQuery, setSearchQuery] = useState("");
  const router = useLocation().route;

  const showChatsList = isMobile ? !selectedConversation.value : true;

  const toggleDark = () => {
    const root = document.documentElement;
    const newDark = !darkModeState;
    if (newDark) root.classList.add("dark");
    else root.classList.remove("dark");
    localStorage.setItem("theme", newDark ? "dark" : "light");
    setDarkModeState(newDark);
  };

  return (
    <div
      class="flex flex-row h-full w-full overflow-hidden"
      style={{ minHeight: 0, minWidth: 0 }}
    >
      {!isMobile && (
        <div class="w-20 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex flex-col items-center py-6 gap-4 shrink-0 overflow-hidden">
          <button
            type="button"
            class={`w-12 h-12 rounded-lg font-bold transition-colors flex items-center justify-center ${
              view === "chats"
                ? "bg-gray-800 text-white dark:bg-gray-300 dark:text-gray-900"
                : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}
            onClick={() => setView("chats")}
            title="Messages"
          >
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
          </button>
          <button
            type="button"
            class={`w-12 h-12 rounded-lg font-bold transition-colors flex items-center justify-center ${
              view === "identity"
                ? "bg-gray-800 text-white dark:bg-gray-300 dark:text-gray-900"
                : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}
            onClick={() => setView("identity")}
            title="Settings"
          >
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
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <div class="flex-grow" />
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleDark}
            className="w-12 h-12"
            title={darkModeState
              ? "Switch to light mode"
              : "Switch to dark mode"}
          >
            {darkModeState ? <FaSun size={20} /> : <FaMoon size={20} />}
          </Button>
        </div>
      )}

      {/* Mobile sidebar - Chats list (hidden when viewing chat) */}
      {isMobile && showChatsList && (
        <div class="flex flex-col w-full h-full overflow-hidden">
          {view === "chats" && (
            <div class="p-4 bg-white dark:bg-gray-900 flex-shrink-0">
              <LogoHeader onClick={() => router(homePath)} />
            </div>
          )}
          {view === "new_chat" && (
            <div class="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex-shrink-0">
              <h2 class="text-lg font-semibold">Start a new chat</h2>
            </div>
          )}
          {view === "identity" && (
            <div class="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex-shrink-0">
              <h2 class="text-lg font-semibold">Account Settings</h2>
            </div>
          )}

          {view === "chats" && (
            <div class="p-3 bg-white dark:bg-gray-900 flex-shrink-0">
              <input
                type="text"
                placeholder="Search chats..."
                value={searchQuery}
                onInput={(e) => setSearchQuery(e.currentTarget.value)}
                class="w-full px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 dark:focus:ring-gray-500 text-sm"
              />
            </div>
          )}

          <div class="flex-1 overflow-y-auto min-h-0" style={scrollbarStyle}>
            {view === "chats" && (
              <OpenChats
                credentials={credentials}
                searchQuery={searchQuery}
                onNewChat={() => setView("new_chat")}
              />
            )}
            {view === "new_chat" && (
              <NewChatScreen
                credentials={credentials}
                onChatCreated={() => setView("chats")}
              />
            )}
            {view === "identity" && (
              <div class="p-4">
                <YourKey credentials={credentials} />
              </div>
            )}
          </div>

          {/* Mobile bottom buttons */}
          <div class="border-t border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-900 flex gap-2 flex-shrink-0">
            <button
              type="button"
              class={`flex-1 px-3 py-2 rounded-lg font-medium transition-colors ${
                view === "chats"
                  ? "bg-gray-800 text-white dark:bg-gray-300 dark:text-gray-900"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
              onClick={() => setView("chats")}
            >
              Chats
            </button>
            <button
              type="button"
              class={`flex-1 px-3 py-2 rounded-lg font-medium transition-colors ${
                view === "new_chat"
                  ? "bg-gray-800 text-white dark:bg-gray-300 dark:text-gray-900"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
              onClick={() => setView("new_chat")}
            >
              New
            </button>
            <button
              type="button"
              class={`flex-1 px-3 py-2 rounded-lg font-medium transition-colors ${
                view === "identity"
                  ? "bg-gray-800 text-white dark:bg-gray-300 dark:text-gray-900"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
              onClick={() => setView("identity")}
            >
              Settings
            </button>
          </div>
        </div>
      )}

      {/* Desktop content area */}
      {!isMobile && (
        <div
          style={{
            display: "flex",
            flexGrow: 1,
            flexDirection: "row",
            minWidth: 0,
            overflow: "hidden",
          }}
        >
          {view === "chats" && (
            <>
              {/* Chat list sidebar */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  flex: "0 0 380px",
                  overflow: "hidden",
                }}
                class="border-r border-gray-200 dark:border-gray-700"
              >
                <div class="p-4 bg-white dark:bg-gray-900">
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                      justifyContent: "space-between",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <LogoHeader onClick={() => router(homePath)} />
                    </div>
                    <button
                      type="button"
                      class="w-10 h-10 flex items-center justify-center bg-gray-800 hover:bg-gray-900 dark:bg-gray-300 dark:hover:bg-gray-400 text-white dark:text-gray-900 rounded-lg transition-colors flex-shrink-0"
                      onClick={() => setView("new_chat")}
                      title="New Chat"
                    >
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
                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 8.5-8.5 8.38 8.38 0 0 1 3.8.9" />
                        <line x1="12" y1="9" x2="12" y2="15" />
                        <line x1="9" y1="12" x2="15" y2="12" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div class="p-3 bg-white dark:bg-gray-900">
                  <input
                    type="text"
                    placeholder="Search chats..."
                    value={searchQuery}
                    onInput={(e) => setSearchQuery(e.currentTarget.value)}
                    class="w-full px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 dark:focus:ring-gray-500 text-sm"
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    flexGrow: 1,
                    flexDirection: "column",
                    overflowY: "auto",
                    ...scrollbarStyle,
                  }}
                >
                  <OpenChats
                    credentials={credentials}
                    searchQuery={searchQuery}
                    onNewChat={() => setView("new_chat")}
                  />
                </div>
              </div>
              {/* Chat view */}
              <div
                style={{
                  display: "flex",
                  flex: "1 1 0",
                  flexDirection: "column",
                  minWidth: 0,
                  overflow: "hidden",
                }}
              >
                {selectedConversation.value
                  ? (
                    <Chat
                      credentials={credentials}
                      conversationId={selectedConversation.value}
                    />
                  )
                  : <EmptyChatsView onNewChat={() => setView("new_chat")} />}
              </div>
            </>
          )}
          {view === "new_chat" && (
            <div
              style={{ display: "flex", flexGrow: 1, flexDirection: "column" }}
            >
              <div class="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
                <h2 class="text-lg font-semibold">Start a new chat</h2>
              </div>
              <div
                style={{
                  display: "flex",
                  flexGrow: 1,
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                class="p-4"
              >
                <div style={{ maxWidth: "500px", width: "100%" }}>
                  <NewChatScreen
                    credentials={credentials}
                    onChatCreated={() => setView("chats")}
                  />
                </div>
              </div>
            </div>
          )}
          {view === "identity" && (
            <div
              style={{ display: "flex", flexGrow: 1, flexDirection: "column" }}
            >
              <div class="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
                <h2 class="text-lg font-semibold">Account Settings</h2>
              </div>
              <div
                style={{
                  display: "flex",
                  flexGrow: 1,
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  ...scrollbarStyle,
                }}
                class="p-8 overflow-y-auto"
              >
                <div style={{ maxWidth: "600px", width: "100%" }}>
                  <YourKey credentials={credentials} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mobile chat view */}
      {isMobile && view === "chats" && selectedConversation.value && (
        <div
          style={{
            display: "flex",
            flexGrow: 1,
            flexDirection: "column",
            width: "100%",
            height: "100%",
            minHeight: 0,
          }}
        >
          <Chat
            credentials={credentials}
            conversationId={selectedConversation.value}
            onClose={() => {
              selectedConversation.value = null;
            }}
          />
        </div>
      )}
    </div>
  );
};

const MessengerLogin = ({ setCredentials }: {
  setCredentials: (creds: Credentials) => void;
}) => {
  const [storeInBrowser, setStoreInBrowser] = useState(true);
  const [showForm, setShowForm] = useState<null | "existing">(null);
  const [displayName, setDisplayName] = useState("");
  const [creatingIdentity, setCreatingIdentity] = useState(false);
  const [showWhat, setShowWhat] = useState(false);
  const [showNoEmail, setShowNoEmail] = useState(false);
  const loc = useLocation();
  const router = useLocation().route;
  // Keep showForm in sync with URL so browser back returns to the question
  useEffect(() => {
    const v = (loc.query["login"] ?? "") as string;
    if (v === "existing") {
      setShowForm(v);
    } else {
      setShowForm(null);
    }
  }, [JSON.stringify(loc.query)]);

  const createIdentityWithName = async (name: string) => {
    if (!name.trim()) {
      toast.error("Please enter a display name");
      return;
    }
    try {
      setCreatingIdentity(true);
      const creds = await createIdentity(name.trim());
      if (storeInBrowser) {
        try {
          localStorage.setItem("alicebot_credentials", JSON.stringify(creds));
        } catch (e) {
          console.error("failed storing credentials in localStorage", e);
        }
      }
      setCredentials(creds);
      const params = new URLSearchParams(globalThis.location.search);
      params.delete("login");
      const newUrl = `${loc.path}${
        params.toString() ? `?${params.toString()}` : ""
      }`;
      router(newUrl);
    } catch (e) {
      console.error("Error creating identity", e);
      toast.error("Unexpected error creating identity");
    } finally {
      setCreatingIdentity(false);
    }
  };
  return (
    <div class="flex flex-col flex-grow">
      {showForm === null && (
        <div class="flex flex-col items-center gap-4 mb-6 flex-grow justify-center text-center px-4">
          <div class="text-lg font-semibold max-w-xl">
            We don't know you yet. What's your name?
          </div>
          <div class="w-full max-w-md flex flex-col gap-3">
            <input
              class={inputStyle}
              placeholder="Display name"
              value={displayName}
              onInput={(e) => setDisplayName(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && displayName.trim()) {
                  createIdentityWithName(displayName);
                }
              }}
            />
            <div class="flex items-center">
              <input
                id="storeInBrowser0"
                type="checkbox"
                checked={storeInBrowser}
                onChange={(e) => setStoreInBrowser(e.currentTarget.checked)}
                class="mr-2"
              />
              <label for="storeInBrowser0" class={labelSmallStyle}>
                {storeCredentialsLabel}
              </label>
            </div>
            <div class="flex justify-center">
              <Button
                type="button"
                className="px-8"
                disabled={creatingIdentity}
                onClick={() => createIdentityWithName(displayName)}
              >
                {creatingIdentity ? "Creating..." : "Continue"}
              </Button>
            </div>
            <Button
              variant="link"
              size="sm"
              type="button"
              onClick={() => {
                const params = new URLSearchParams(globalThis.location.search);
                params.set("login", "existing");
                router(`${loc.path}?${params.toString()}`);
              }}
            >
              I already have an account
            </Button>
          </div>
        </div>
      )}
      {showForm === null && (
        <div class="pt-2 self-center max-w-md w-full">
          <button
            type="button"
            class="w-full flex justify-between items-center py-2 px-3 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
            onClick={() => setShowWhat((v) => !v)}
          >
            <span class="text-lg font-semibold">What is Alice&Bot?</span>
            <span class="ml-2 text-gray-500">
              {showWhat ? <Chevron up /> : <Chevron up={false} />}
            </span>
          </button>
          {showWhat && (
            <div class="px-3 mt-2 text-base">
              An end-to-end encrypted messenger for people and bots. Create a
              self-owned cryptographic identity and chat using a public key or
              an @alias.
            </div>
          )}
          <div class="mt-3"></div>
          <button
            type="button"
            class="w-full flex justify-between items-center py-2 px-3 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
            onClick={() => setShowNoEmail((v) => !v)}
          >
            <span class="text-lg font-semibold">
              Do I need to give out my email or phone?
            </span>
            <span class="ml-2 text-gray-500">
              {showNoEmail ? <Chevron up /> : <Chevron up={false} />}
            </span>
          </button>
          {showNoEmail && (
            <div class="px-3 mt-2 text-base">
              No. You create a self-owned identity right here—no email, phone
              number, or personal info required. Your keys are generated locally
              in your browser. You can keep the credentials in this browser or
              copy the credentials string to store safely elsewhere.
            </div>
          )}
        </div>
      )}
      {showForm === "existing" && (
        <div class="flex flex-col items-center flex-grow justify-center px-4">
          <div class="w-full max-w-md">
            <ExistingUserForm
              onIdentified={(creds) => setCredentials(creds)}
              storeInBrowser={storeInBrowser}
              setStoreInBrowser={setStoreInBrowser}
            />
          </div>
        </div>
      )}
    </div>
  );
};

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
    toast.error("Transfer link expired or already used");
    return;
  }
  const creds = await decryptSymmetric<Credentials>(
    parsed.aesKey,
    result.encryptedPayload as EncryptedSymmetric<Credentials>,
  );
  localStorage.setItem("alicebot_credentials", JSON.stringify(creds));
  toast.success("Credentials imported — reloading…");
  setTimeout(() => globalThis.location.reload(), 500);
};

export const Messenger = () => {
  const location = useLocation();
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [credentialsChecked, setCredentialsChecked] = useState(false);
  const [initializedFromQuery, setInitializedFromQuery] = useState(false);

  const conversations = useConversations(() => db)(
    credentials?.publicSignKey ?? "",
  );
  const [view, setView] = useState<View>("chats");
  useLayoutEffect(() => {
    const cleanup = initViewportHeightListener();
    return cleanup;
  }, []);
  useLayoutEffect(() => {
    if (typeof document === "undefined") return;
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
  }, []);
  useLayoutEffect(() => {
    try {
      const stored = localStorage.getItem("alicebot_credentials");
      if (stored) setCredentials(JSON.parse(stored));
    } catch (e) {
      console.error("Failed to parse stored credentials", e);
    }
    setCredentialsChecked(true);
  }, []);
  useEffect(() => {
    handleTransferImport();
  }, []);
  const chatWith = location.query["chatWith"];
  const topic = location.query["topic"] as string | undefined;
  const route = useLocation().route;
  const [handledChatWith, setHandledChatWith] = useState<string | null>(null);
  const chatWithInFlight = useRef(false);
  useEffect(() => {
    if (!credentials || !conversations) return;
    const cw = (chatWith as string | undefined) ?? undefined;
    if (!cw) return;
    // To allow handling the same chatWith but different topic, we incorporate topic into the state string
    const handledKey = topic ? `${cw}-${topic}` : cw;
    if (handledChatWith === handledKey) return; // already processed this value
    if (chatWithInFlight.current) return; // creation already in progress
    chatWithInFlight.current = true;
    (async () => {
      // Resolve alias to public sign key if needed
      let resolvedKey = cw;
      try {
        const res = await aliasToPublicSignKey(cw);
        if ("publicSignKey" in res) resolvedKey = res.publicSignKey;
      } catch (_) {
        // assume it's already a public sign key
      }

      let conversationId: string | null = null;

      // If a topic is provided, first look for an existing conversation with that topic.
      // If not found, create a new conversation with that topic.
      const existing = conversations.find(
        isMatch(credentials.publicSignKey, resolvedKey, topic),
      );
      if (existing) {
        selectedConversation.value = existing.id;
        conversationId = existing.id;
      } else {
        conversationId = await startConversation(credentials, cw, topic);
      }

      if (!conversationId) {
        chatWithInFlight.current = false;
        return; // failed to create
      }

      // Build a stable URL: remove chatWith and topic, set c=<id>, ensure chats view
      const params = new URLSearchParams(globalThis.location.search);
      params.delete("chatWith");
      params.delete("topic");
      params.delete("login");
      params.delete("view");
      params.set("c", conversationId);
      const newUrl = `${chatPath}?${params.toString()}`;
      route(newUrl, true);
      setHandledChatWith(handledKey);
      chatWithInFlight.current = false;
    })();
  }, [credentials, chatWith, topic, conversations, handledChatWith]);

  // Keep URL in sync with current messenger state so browser Back works.
  useEffect(() => {
    if (!credentials) return; // avoid interfering with login flow query params
    if (!initializedFromQuery) return; // wait until state is initialized from URL
    const params = new URLSearchParams(globalThis.location.search);
    // Never preserve invite param once inside messenger
    params.delete("chatWith");
    params.delete("topic");
    // We only manage 'view' and 'c' (conversation id) here; preserve others.
    if (view === "identity") {
      params.set("view", "identity");
      params.delete("c");
    } else if (view === "new_chat") {
      params.set("view", "new_chat");
      params.delete("c");
    } else {
      // chats
      params.delete("view");
      if (selectedConversation.value) {
        params.set("c", selectedConversation.value);
      } else params.delete("c");
    }
    const newUrl = `${chatPath}${
      params.toString() ? `?${params.toString()}` : ""
    }`;
    const currentUrl =
      `${globalThis.location.pathname}${globalThis.location.search}`;
    if (currentUrl !== newUrl) {
      route(newUrl);
    }
  }, [credentials, view, selectedConversation.value, initializedFromQuery]);

  // Reflect URL query changes back to local state (supports browser Back).
  useEffect(() => {
    if (!credentials) return; // only relevant inside messenger
    const q = location.query as Record<string, string | undefined>;
    // If we're arriving via an invite, let the invite effect handle state
    if (q["chatWith"]) return;
    const v = q["view"] as View | undefined;
    const c = q["c"] as string | undefined;
    if (v === "identity" || v === "new_chat") {
      if (selectedConversation.value !== null) {
        selectedConversation.value = null;
      }
      if (view !== v) setView(v);
      if (!initializedFromQuery) setInitializedFromQuery(true);
      return;
    }
    // default to chats
    if (c) {
      if (view !== "chats") setView("chats");
      if (selectedConversation.value !== c) selectedConversation.value = c;
    } else {
      if (view !== "chats") setView("chats");
      if (selectedConversation.value !== null) {
        selectedConversation.value = null;
      }
    }
    if (!initializedFromQuery) setInitializedFromQuery(true);
  }, [credentials, JSON.stringify(location.query)]);
  useEffect(() => {
    if (!credentials) return;
    const fire = () => reportActive(credentials);
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
  }, [credentials]);
  return (
    <div
      class={`flex flex-col w-full overflow-hidden ${textColorStyle}`}
      style={{ height: "var(--app-height, 100dvh)" }}
    >
      {!credentialsChecked && (
        <div
          style={{
            display: "flex",
            flexGrow: 1,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Spinner />
        </div>
      )}
      {credentialsChecked && !credentials && (
        <MessengerLogin setCredentials={setCredentials} />
      )}
      {credentialsChecked && credentials && (
        <LoggedInMessenger
          setView={setView}
          credentials={credentials}
          view={view}
        />
      )}
    </div>
  );
};

const CopyCredentialsButton = () => {
  const [copied, setCopied] = useState(false);
  return (
    <div class="mb-4">
      <Button
        variant="secondary"
        type="button"
        onClick={() => {
          const creds = localStorage.getItem("alicebot_credentials");
          if (creds) {
            navigator.clipboard.writeText(creds);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }
        }}
      >
        Copy secret credentials{" "}
        {copied && <span class="text-sm ml-1">Copied!</span>}
      </Button>
      <div class={hintStyle}>
        Warning: Never share your credentials. Anyone with them has access to
        all your chats forever.
      </div>
    </div>
  );
};

const CopyInviteLinkButton = ({ publicSignKey }: { publicSignKey: string }) => {
  const [copied, setCopied] = useState(false);
  const link = chatWithMeLink(publicSignKey);
  return (
    <div class="mb-4">
      <Button
        variant="secondary"
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(link);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        Copy invite link {copied && <span class="text-sm ml-1">Copied!</span>}
      </Button>
      <div class={hintStyle}>
        Share this link so others can start a chat with you.
      </div>
    </div>
  );
};

const DeleteCredentialsButton = () => (
  <div class="mb-4">
    <Button
      variant="destructive"
      type="button"
      onClick={() => {
        if (
          confirm(
            "Are you sure? If you delete your credentials from this browser, you will lose access unless you have saved them elsewhere.",
          )
        ) {
          localStorage.removeItem("alicebot_credentials");
          globalThis.location.reload();
        }
      }}
    >
      Delete credentials and sign out
    </Button>
    <div class={hintStyle}>
      Warning: Your key is not stored anywhere else. If you delete it and
      haven't saved it, you will lose access to your identity.
    </div>
  </div>
);

const DangerZone = () => {
  const [open, setOpen] = useState(false);
  return (
    <div class="mt-2 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 overflow-hidden">
      <Button
        variant="ghost"
        type="button"
        className="w-full flex justify-between items-center py-2 px-3 text-left hover:bg-red-100/70 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300"
        onClick={() => setOpen((v) => !v)}
      >
        <span class="text-lg font-semibold text-red-700 dark:text-red-300">
          Danger zone
        </span>
        <span class="ml-2 text-red-600/80 dark:text-red-300/80">
          {open ? <Chevron up /> : <Chevron up={false} />}
        </span>
      </Button>
      {open && (
        <div class="px-3 py-2 border-t border-red-200 dark:border-red-800">
          <CopyCredentialsButton />
          <DeleteCredentialsButton />
        </div>
      )}
    </div>
  );
};

const textColorStyle = "text-gray-900 dark:text-gray-200";
const sectionSpacing = "mb-6";
const labelStyle =
  "block mb-2 text-sm font-medium text-gray-900 dark:text-gray-300";
const labelSmallStyle = "block text-xs text-gray-700 dark:text-gray-400";
const inputRowStyle = "flex gap-2 mb-2";
const inputStyle =
  "border px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-gray-500 focus:border-gray-500 dark:focus:ring-gray-500 dark:focus:border-gray-500 max-w-md";
const textareaStyle =
  "w-full border rounded-lg p-2.5 text-sm bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white";
const hintStyle = "text-xs text-gray-600 dark:text-gray-400 mt-1";
