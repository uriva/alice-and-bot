import { html, LitElement, nothing, type TemplateResult } from "lit";
import { sortKey } from "@uri/gamla";
import type {
  Attachment,
  Credentials,
  DecipheredMessage,
} from "../../protocol/src/clientApi.ts";
import {
  downloadAttachment,
  generateTransferUrl,
  sendMessageWithKey,
  uploadAttachment,
} from "../../protocol/src/clientApi.ts";
import { importIdentity, saveCredentials } from "../core/credentials.ts";
import { accessDb } from "../core/instant-client.ts";
import {
  compactPublicKey,
  createTypingNotifier,
  subscribeConversationKey,
  subscribeDecryptedMessages,
  subscribeIdentityDetailsMap,
  subscribeTypingStates,
} from "../core/subscriptions.ts";
import {
  type EphemeralStreamEvent,
  subscribeEphemeralStreams,
} from "../core/room.ts";
import {
  createVoiceCall,
  type VoiceCallController,
} from "../core/voice-call.ts";
import "./chat-box.ts";
import "./user-profile-popup.ts";
import "./chat-avatar.ts";
import { avatarColor } from "./design.ts";
import { copyToClipboard } from "./utils.ts";
import type {
  AbstracChatMessage,
  ActiveProgress,
  ActiveSpinner,
  ActiveStream,
  CustomColors,
  EditHistoryEntry,
  Reaction,
} from "./types.ts";
import {
  isPast,
  latestTimestamp,
  standaloneSpinnerEntries,
} from "./transient-elements.ts";

type TextOrEditMessage = DecipheredMessage & { type: "text" | "edit" };

const isTextOrEdit = (m: DecipheredMessage): m is TextOrEditMessage =>
  m.type === "text" || m.type === "edit";

const hasAttachments = (
  msg: DecipheredMessage,
): msg is DecipheredMessage & { attachments?: Attachment[] } =>
  msg.type === "text" || msg.type === "edit";

const editsForMessage = (edits: TextOrEditMessage[]) => (msgId: string) =>
  sortKey((e: TextOrEditMessage) => e.timestamp)(
    edits.filter((e) => e.type === "edit" && e.editOf === msgId),
  );

const buildEditHistory =
  (edits: TextOrEditMessage[]) =>
  (original: TextOrEditMessage): EditHistoryEntry[] => [
    ...editsForMessage(edits)(original.id).slice(0, -1).map((e) => ({
      text: e.text,
      timestamp: e.timestamp,
      attachments: e.attachments,
    })),
    {
      text: original.text,
      timestamp: original.timestamp,
      attachments: original.attachments,
    },
  ];

const applyLatestEdit =
  (edits: TextOrEditMessage[]) =>
  (original: DecipheredMessage): DecipheredMessage => {
    if (original.type !== "text") return original;
    const msgEdits = editsForMessage(edits)(original.id);
    if (!msgEdits.length) return original;
    const latest = msgEdits[msgEdits.length - 1];
    return { ...original, text: latest.text, attachments: latest.attachments };
  };

const foldEdits = (messages: DecipheredMessage[]) => {
  const edits = messages.filter((m): m is TextOrEditMessage =>
    m.type === "edit"
  );
  return messages.filter((m) => m.type === "text").map((original) => {
    const msg = applyLatestEdit(edits)(original);
    return {
      msg,
      editHistory: original.type === "text" &&
          edits.some((e) => e.type === "edit" && e.editOf === original.id)
        ? buildEditHistory(edits)(original as TextOrEditMessage)
        : undefined,
    };
  });
};

type IdentityDetails = Record<string, { name: string; avatar?: string }>;

type Participant = {
  publicSignKey: string;
  name?: string;
  avatar?: string;
  alias?: string;
};

const resolveName = (details: IdentityDetails) => (key: string): string =>
  details[key]?.name ?? compactPublicKey(key);

const resolveParticipantName = (p: Participant, details: IdentityDetails) =>
  p.name || details[p.publicSignKey]?.name || compactPublicKey(p.publicSignKey);

const resolveParticipantAvatar = (p: Participant, details: IdentityDetails) =>
  p.avatar || details[p.publicSignKey]?.avatar || "";

const participantsOverlayStyle =
  "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000";

const participantsPopupStyle = (isDark: boolean) =>
  `background:${
    isDark ? "#1a1a1a" : "#fff"
  };border-radius:16px;padding:24px;min-width:300px;max-width:400px;width:90%;max-height:80vh;border:1px solid ${
    isDark ? "#2a2a2a" : "#e5e7eb"
  };box-shadow:${
    isDark ? "0 8px 24px #0008" : "0 8px 24px #0002"
  };display:flex;flex-direction:column;gap:16px;box-sizing:border-box`;

const participantsListStyle =
  "display:flex;flex-direction:column;gap:12px;overflow-y:auto;width:100%";

const participantRowStyle = (isDark: boolean) =>
  `display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 12px;border-radius:12px;cursor:pointer;transition:background 0.2s;background:${
    isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)"
  }`;

const participantInfoStyle =
  "display:flex;align-items:center;gap:12px;flex:1;min-width:0";

const participantMetaStyle =
  "display:flex;flex-direction:column;min-width:0;flex:1";

const participantNameStyle = (isDark: boolean) =>
  `font-size:14px;font-weight:600;color:${
    isDark ? "#f4f4f4" : "#222"
  };white-space:nowrap;overflow:hidden;text-overflow:ellipsis`;

const participantIdStyle = (isDark: boolean) =>
  `font-size:11px;font-family:monospace;color:${
    isDark ? "#9ca3af" : "#6b7280"
  };white-space:nowrap;overflow:hidden;text-overflow:ellipsis`;

const copyButtonStyle = (isDark: boolean) =>
  `background:${
    isDark ? "#2a2a2a" : "#e5e7eb"
  };border:none;cursor:pointer;padding:6px 12px;border-radius:6px;font-size:12px;font-weight:500;color:${
    isDark ? "#f4f4f4" : "#222"
  };transition:background 0.15s;flex-shrink:0`;

const popupTitleStyle = (isDark: boolean) =>
  `font-size:18px;font-weight:700;color:${
    isDark ? "#f4f4f4" : "#222"
  };margin:0;text-align:center`;

const closeButtonStyle = (isDark: boolean) =>
  `padding:8px 16px;border-radius:8px;border:none;cursor:pointer;font-size:14px;font-weight:500;background:${
    isDark ? "#2a2a2a" : "#e5e7eb"
  };color:${
    isDark ? "#f4f4f4" : "#222"
  };transition:background 0.15s;align-self:center;margin-top:8px`;

const sameCredentials = (
  a: Credentials | null,
  b: Credentials | null,
): boolean =>
  a === b || !!a && !!b && a.publicSignKey === b.publicSignKey &&
    a.privateSignKey === b.privateSignKey &&
    a.privateEncryptKey === b.privateEncryptKey;

const credentialsOrNull = (value: unknown): Credentials | null => {
  if (!value || typeof value !== "object") return null;
  const publicSignKey = Reflect.get(value, "publicSignKey");
  const privateSignKey = Reflect.get(value, "privateSignKey");
  const privateEncryptKey = Reflect.get(value, "privateEncryptKey");
  return typeof publicSignKey === "string" &&
      typeof privateSignKey === "string" &&
      typeof privateEncryptKey === "string"
    ? { publicSignKey, privateSignKey, privateEncryptKey }
    : null;
};

type ReactionMsg = DecipheredMessage & {
  type: "reaction";
  reactTo: string;
  emoji: string;
  remove?: boolean;
};

const isReaction = (m: DecipheredMessage): m is ReactionMsg =>
  m.type === "reaction";

const aggregateReactions = (
  reactions: ReactionMsg[],
  details: IdentityDetails,
) =>
(msgId: string): Reaction[] => {
  const active = new Map<string, ReactionMsg>();
  sortKey((r: ReactionMsg) => r.timestamp)(
    reactions.filter((r) => r.reactTo === msgId),
  ).forEach((r) => {
    const key = `${r.publicSignKey}:${r.emoji}`;
    if (r.remove) active.delete(key);
    else active.set(key, r);
  });
  return Array.from(active.values()).map((r) => ({
    emoji: r.emoji,
    authorId: r.publicSignKey,
    authorName: resolveName(details)(r.publicSignKey),
  }));
};

const msgToUIMessage =
  (details: IdentityDetails) =>
  (msg: DecipheredMessage): AbstracChatMessage & { _replyToId?: string } => ({
    id: msg.id,
    authorId: msg.publicSignKey,
    authorName: resolveName(details)(msg.publicSignKey),
    authorAvatar: details[msg.publicSignKey]?.avatar,
    text: msg.text,
    timestamp: msg.timestamp,
    attachments: hasAttachments(msg) ? msg.attachments : undefined,
    _replyToId: msg.type === "text" ? msg.replyTo : undefined,
  });

const msgToUIMessageWithHistory = (details: IdentityDetails) =>
(
  { msg, editHistory }: {
    msg: DecipheredMessage;
    editHistory?: EditHistoryEntry[];
  },
): AbstracChatMessage => ({
  ...msgToUIMessage(details)(msg),
  editHistory,
});

const resolveReplyTo =
  (msgMap: Map<string, AbstracChatMessage>) =>
  (msg: AbstracChatMessage & { _replyToId?: string }): AbstracChatMessage => {
    const { _replyToId, ...rest } = msg;
    if (!_replyToId) return rest;
    const target = msgMap.get(_replyToId);
    if (!target) {
      return {
        ...rest,
        replyTo: {
          id: _replyToId,
          authorId: "",
          authorName: "Unknown",
          text: "",
        },
      };
    }
    return {
      ...rest,
      replyTo: {
        id: target.id,
        authorId: target.authorId,
        authorName: target.authorName,
        text: target.text,
      },
    };
  };

type UiOverride = {
  active?: boolean;
  percentage?: number;
  text?: string;
  type?: string;
};

const latestSpinners = (
  messages: DecipheredMessage[],
  details: IdentityDetails,
  uiOverrides: Map<string, UiOverride>,
): ActiveSpinner[] => {
  const byElement = new Map<string, DecipheredMessage>();
  sortKey((x: DecipheredMessage) => x.timestamp)(
    messages.filter((m) => m.type === "spinner"),
  ).forEach((m) => {
    if (m.type === "spinner") byElement.set(m.elementId, m);
  });
  return Array.from(byElement.values())
    .filter((m) => m.type === "spinner")
    .map((m) => {
      if (m.type !== "spinner") throw new Error("unreachable");
      const override = uiOverrides.get(m.elementId);
      return {
        authorName: resolveName(details)(m.publicSignKey),
        text: m.text,
        elementId: m.elementId,
        timestamp: m.timestamp,
        active: isPast(m.timestamp, messages)
          ? false
          : (override?.active ?? m.active),
      };
    });
};

const latestProgress = (
  messages: DecipheredMessage[],
  details: IdentityDetails,
  uiOverrides: Map<string, UiOverride>,
): ActiveProgress[] => {
  const byElement = new Map<string, DecipheredMessage>();
  sortKey((x: DecipheredMessage) => x.timestamp)(
    messages.filter((m) => m.type === "progress"),
  ).forEach((m) => {
    if (m.type === "progress") byElement.set(m.elementId, m);
  });
  return Array.from(byElement.values())
    .filter((m) => m.type === "progress")
    .map((m) => {
      if (m.type !== "progress") throw new Error("unreachable");
      const override = uiOverrides.get(m.elementId);
      return {
        authorName: resolveName(details)(m.publicSignKey),
        text: m.text,
        percentage: isPast(m.timestamp, messages)
          ? 1
          : (override?.percentage ?? m.percentage),
        elementId: m.elementId,
        timestamp: m.timestamp,
      };
    });
};

const enforceMonotonic = (
  maxMap: Map<string, number>,
  entries: ActiveProgress[],
): ActiveProgress[] =>
  entries.map((entry) => {
    const monotonic = Math.max(
      maxMap.get(entry.elementId) ?? 0,
      entry.percentage,
    );
    maxMap.set(entry.elementId, monotonic);
    return { ...entry, percentage: monotonic };
  });

const messageElementIds = (messages: DecipheredMessage[]) =>
  new Set(
    messages
      .filter((m): m is DecipheredMessage & { elementId: string } =>
        "elementId" in m
      )
      .map((m) => m.elementId),
  );

type UiElement = {
  elementId: string;
  active?: boolean;
  percentage?: number;
  text?: string;
  type?: string;
  updatedAt: number;
};

const standaloneProgressEntries = (
  uiElements: UiElement[],
  knownIds: Set<string>,
): ActiveProgress[] =>
  uiElements
    .filter((el) => el.type === "progress" && !knownIds.has(el.elementId))
    .map((el) => ({
      authorName: "",
      text: el.text ?? "",
      percentage: el.percentage ?? 0,
      elementId: el.elementId,
      timestamp: el.updatedAt,
    }));

const standaloneStreamEntries = (
  streams: EphemeralStreamEvent[],
  knownIds: Set<string>,
  persistedTexts: Set<string>,
  details: IdentityDetails,
): ActiveStream[] =>
  streams
    .filter((el) => {
      if (knownIds.has(el.elementId)) return false;
      const trimmed = el.text?.trim() ?? "";
      if (trimmed !== "" && persistedTexts.has(el.text ?? "")) return false;
      return el.active !== false || trimmed !== "";
    })
    .map((el) => ({
      authorName: el.authorId ? resolveName(details)(el.authorId) : "",
      authorAvatar: el.authorId ? details[el.authorId]?.avatar : undefined,
      authorPublicKey: el.authorId,
      text: el.text ?? "",
      elementId: el.elementId,
      timestamp: el.updatedAt,
      active: el.active !== false,
    }));

const uiOverridesMap = (uiElements: UiElement[]) =>
  new Map(
    uiElements.map((el) => [el.elementId, {
      active: el.active,
      percentage: el.percentage,
      text: el.text,
      type: el.type,
    }]),
  );

const notFoundHtml = (customColors?: CustomColors, isDark?: boolean) =>
  html`
    <div
      style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;width:100%;color:${customColors
        ?.text ?? "#6b7280"};background:${customColors?.background ??
        (isDark ? "#111" : "#f9fafb")};font-family:sans-serif"
    >
      <div style="font-size:3rem;margin-bottom:1rem">?</div>
      <div style="font-size:1.25rem;font-weight:600;margin-bottom:0.5rem">
        Chat Not Found
      </div>
      <div style="font-size:0.9rem">This conversation does not exist.</div>
    </div>
  `;

const accessDeniedHtml = (
  onClose: (() => void) | undefined,
  customColors?: CustomColors,
  isDark?: boolean,
) =>
  html`
    <div
      style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;width:100%;color:${customColors
        ?.text ?? "#6b7280"};background:${customColors?.background ??
        (isDark ? "#111" : "#f9fafb")};font-family:sans-serif"
    >
      <div style="font-size:3rem;margin-bottom:1rem">&#128274;</div>
      <div style="font-size:1.25rem;font-weight:600;margin-bottom:0.5rem">
        Access Denied
      </div>
      <div style="font-size:0.9rem">
        You do not have the encryption keys for this conversation.
      </div>
      ${onClose
        ? html`
          <button
            type="button"
            @click="${onClose}"
            style="margin-top:1.5rem;padding:0.5rem 1rem;background:${customColors
              ?.primary ??
              "#1a1a1a"};color:white;border-radius:0.375rem;border:none;cursor:pointer;font-weight:500"
          >
            Go Back
          </button>
        `
        : nothing}
    </div>
  `;

export class ConnectedChat extends LitElement {
  static override properties = {
    credentials: { attribute: false },
    conversationId: { attribute: false },
    onClose: { attribute: false },
    darkModeOverride: { type: Boolean },
    customColors: { attribute: false },
    enableAttachments: { type: Boolean },
    enableAudioRecording: { type: Boolean },
    enableVoiceCall: { type: Boolean },
    isDark: { type: Boolean },
    emptyMessage: { attribute: false },
    onChatWith: { attribute: false },
  };

  declare credentials: Credentials | null;
  declare conversationId: string;
  declare onClose: (() => void) | undefined;
  declare darkModeOverride: boolean | undefined;
  declare customColors: CustomColors | undefined;
  declare enableAttachments: boolean;
  declare enableAudioRecording: boolean;
  declare enableVoiceCall: boolean;
  declare isDark: boolean;
  declare emptyMessage: string | undefined;
  declare onChatWith: ((publicSignKey: string) => void) | undefined;

  constructor() {
    super();
    this.credentials = null;
    this.conversationId = "";
    this.enableAttachments = true;
    this.enableAudioRecording = true;
    this.enableVoiceCall = false;
    this.isDark = false;
  }

  private _conversationKey: string | null = null;
  private _messages: DecipheredMessage[] | null = null;
  private _hadMessages = false;
  private _lastMessageSubscriptionKey: string | null | undefined = undefined;
  private _lastMessageCount = 0;
  private _canLoadMore = false;
  private _loadMore: () => void = () => {};
  private _typingNames: string[] = [];
  private _identityDetails: IdentityDetails = {};
  private _ephemeralStreams: EphemeralStreamEvent[] = [];
  private _uiElements: UiElement[] = [];
  private _hasAccess = true;
  private _convNotFound = false;
  private _conversationTitle = "Chat";
  private _isGroupChat = false;
  private _progressMax = new Map<string, number>();
  private _profileAuthorId: string | null = null;
  private _participants: Participant[] = [];
  private _showParticipantsPopup = false;
  private _copiedParticipantId: string | null = null;
  private _showSecretIdentityPopup = false;
  private _showImportIdentityPopup = false;
  private _qrCodeDataUrl = "";
  private _transferUrl = "";
  private _copiedTransferUrl = false;
  private _importing = false;

  private _unsubs: (() => void)[] = [];
  private _typingNotifier: ReturnType<typeof createTypingNotifier> | null =
    null;
  private _suppressTypingAuthor: ((publicSignKey: string) => void) | null =
    null;
  private _voiceCall: VoiceCallController | null = null;

  override createRenderRoot(): HTMLElement {
    return this;
  }

  override connectedCallback() {
    super.connectedCallback();
    this.style.display = "flex";
    this.style.flexDirection = "column";
    this.style.flexGrow = "1";
    this.style.minHeight = "0";
    this.style.minWidth = "0";
    this.style.maxWidth = "100%";
    this._setupSubscriptions();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._teardown();
  }

  private get _effectiveDark() {
    return this.darkModeOverride !== undefined
      ? this.darkModeOverride
      : this.isDark;
  }

  override updated(changed: Map<string, unknown>) {
    const credentialsChanged = changed.has("credentials") &&
      !sameCredentials(
        credentialsOrNull(changed.get("credentials")),
        this.credentials,
      );
    if (credentialsChanged || changed.has("conversationId")) {
      this._teardown();
      this._setupSubscriptions();
    }
  }

  private _teardown() {
    this._unsubs.forEach((u) => u());
    this._unsubs = [];
    this._typingNotifier?.stop();
    this._typingNotifier = null;
    this._suppressTypingAuthor = null;
    this._voiceCall?.cleanup();
    this._voiceCall = null;
    this._messagesUnsub?.();
    this._messagesUnsub = null;
    this._identityUnsub?.();
    this._identityUnsub = null;
    this._lastIdentityKeys = "";
    this._progressMax.clear();
    this._hadMessages = false;
    this._lastMessageSubscriptionKey = undefined;
    this._lastMessageCount = 0;
    this._participants = [];
    this._showParticipantsPopup = false;
    this._copiedParticipantId = null;
    this._messages = null;
    this._conversationKey = null;
  }

  private _setupSubscriptions() {
    if (!this.credentials || !this.conversationId) return;

    const { publicSignKey } = this.credentials;

    this._typingNotifier = createTypingNotifier(
      this.conversationId,
      publicSignKey,
    );

    this._voiceCall = createVoiceCall({
      conversationId: this.conversationId,
      credentials: this.credentials,
      getConversationKey: () => this._conversationKey,
      getMessages: () => this._messages ?? [],
      onChange: () => this.requestUpdate(),
    });

    this._unsubs.push(
      accessDb().subscribeQuery(
        {
          conversations: {
            participants: {},
            $: { where: { id: this.conversationId } },
          },
        },
        ({ data }) => {
          if (!data) return;
          const conv = data.conversations[0];
          this._convNotFound = !conv;
          this._conversationTitle = conv?.title || "Chat";
          this._isGroupChat = (conv?.participants.length ?? 0) > 2;
          this._participants = conv?.participants ?? [];
          this.requestUpdate();
        },
      ),
    );

    this._unsubs.push(
      accessDb().subscribeQuery(
        {
          identities: {
            $: { where: { publicSignKey } },
            keys: {
              $: { where: { conversation: this.conversationId } },
            },
          },
        },
        ({ data }) => {
          if (!data) return;
          this._hasAccess = (data.identities?.[0]?.keys?.length ?? 0) > 0;
          this.requestUpdate();
        },
      ),
    );

    this._unsubs.push(
      subscribeConversationKey(
        this.conversationId,
        this.credentials,
        (key) => {
          if (key === this._lastMessageSubscriptionKey) return;
          this._lastMessageSubscriptionKey = key;
          this._conversationKey = key;
          this._resubscribeMessages();
          this.requestUpdate();
        },
      ),
    );

    const typingSub = subscribeTypingStates(
      this.conversationId,
      publicSignKey,
      (names) => {
        this._typingNames = names;
        this.requestUpdate();
      },
    );
    this._unsubs.push(typingSub.unsub);
    this._suppressTypingAuthor = typingSub.suppressAuthor;

    this._unsubs.push(
      subscribeEphemeralStreams(this.conversationId, (streams) => {
        this._ephemeralStreams = streams;
        this._resubscribeIdentities();
        this.requestUpdate();
      }),
    );

    this._unsubs.push(
      accessDb().subscribeQuery(
        {
          uiElements: {
            $: { where: { conversation: this.conversationId } },
          },
        },
        ({ data }) => {
          this._uiElements = (data?.uiElements ?? []) as UiElement[];
          this.requestUpdate();
        },
      ),
    );
  }

  private _identityUnsub: (() => void) | null = null;
  private _lastIdentityKeys = "";
  private _messagesUnsub: (() => void) | null = null;

  private _resubscribeMessages() {
    this._messagesUnsub?.();
    this._messagesUnsub = subscribeDecryptedMessages(
      this.conversationId,
      this._conversationKey,
      ({ messages, canLoadMore, loadMore }) => {
        if (!messages) return;
        if (messages.length === 0 && this._hadMessages) return;
        const messagesChanged = !this._messages ||
          this._messages.length !== messages.length ||
          this._messages.some((m, i) => m.id !== messages[i].id);
        const canLoadMoreChanged = this._canLoadMore !== canLoadMore;
        if (!messagesChanged && !canLoadMoreChanged) return;
        if (messages.length > this._lastMessageCount) {
          const latestMessage = messages[0];
          if (latestMessage) {
            this._suppressTypingAuthor?.(latestMessage.publicSignKey);
          }
        }
        this._messages = messages;
        this._lastMessageCount = messages.length;
        this._hadMessages = this._hadMessages || messages.length > 0;
        this._canLoadMore = canLoadMore;
        this._loadMore = loadMore;
        this._resubscribeIdentities();
        this._voiceCall?.handleMessages();
        this.requestUpdate();
      },
    );
  }

  private _resubscribeIdentities() {
    const keys = [
      ...(this._messages ?? []).map((m) => m.publicSignKey),
      ...this._ephemeralStreams
        .map((e) => e.authorId)
        .filter((x): x is string => Boolean(x)),
    ];
    const sorted = [...new Set(keys)].sort().join(",");
    if (sorted === this._lastIdentityKeys) return;
    this._lastIdentityKeys = sorted;
    this._identityUnsub?.();
    this._identityUnsub = subscribeIdentityDetailsMap(keys, (details) => {
      this._identityDetails = details;
      this.requestUpdate();
    });
  }

  private _processMessages() {
    const messages = this._messages ?? [];
    const details = this._identityDetails;
    const overrides = uiOverridesMap(this._uiElements);
    const knownIds = messageElementIds(messages);
    const messageTimestampFloor = latestTimestamp(messages);
    const reactions = messages.filter(isReaction);
    const addReactions = aggregateReactions(reactions, details);
    const withReactions = foldEdits(messages.filter(isTextOrEdit)).map(
      msgToUIMessageWithHistory(details),
    ).map((m) => {
      const r = addReactions(m.id);
      return r.length ? { ...m, reactions: r } : m;
    });
    const msgMap = new Map(withReactions.map((m) => [m.id, m]));
    const persistedTexts = new Set(withReactions.map((m) => m.text));
    return {
      chatMessages: withReactions.map(resolveReplyTo(msgMap)),
      activeSpinners: [
        ...latestSpinners(messages, details, overrides),
        ...standaloneSpinnerEntries(
          this._uiElements,
          knownIds,
          messageTimestampFloor,
        ),
      ],
      activeProgress: enforceMonotonic(this._progressMax, [
        ...latestProgress(messages, details, overrides),
        ...standaloneProgressEntries(this._uiElements, knownIds),
      ]),
      activeStreams: standaloneStreamEntries(
        this._ephemeralStreams,
        knownIds,
        persistedTexts,
        details,
      ),
    };
  }

  private _handleSend = (text: string, replyTo?: string) => {
    if (!this._conversationKey || !this.credentials) return;
    sendMessageWithKey({
      conversationKey: this._conversationKey,
      credentials: this.credentials,
      message: { type: "text", text, replyTo },
      conversation: this.conversationId,
    }).catch((err) => console.error("Failed to send message", err));
    this._typingNotifier?.onBlurOrSend();
  };

  private _handleSendWithAttachments = async (
    text: string,
    files: File[],
    audioDuration?: number,
    replyTo?: string,
  ) => {
    if (!this._conversationKey || !this.credentials) return;
    const attachments: Attachment[] = [];
    for (const file of files) {
      const result = await uploadAttachment({
        credentials: this.credentials,
        conversationId: this.conversationId,
        conversationKey: this._conversationKey,
        file,
        durationOverride: audioDuration,
      });
      if ("error" in result) {
        alert(`Failed to upload ${file.name}: ${result.error}`);
        return;
      }
      attachments.push(result);
    }
    await sendMessageWithKey({
      conversationKey: this._conversationKey,
      credentials: this.credentials,
      message: { type: "text", text, attachments, replyTo },
      conversation: this.conversationId,
    });
    this._typingNotifier?.onBlurOrSend();
  };

  private _handleDecryptAttachment = async (url: string) => {
    if (!this._conversationKey) throw new Error("No conversation key");
    const arrayBuffer = await downloadAttachment({
      url,
      conversationKey: this._conversationKey,
    });
    return URL.createObjectURL(new Blob([arrayBuffer]));
  };

  private _handleEdit = async (messageId: string, newText: string) => {
    if (!this._conversationKey || !this.credentials) return;
    await sendMessageWithKey({
      conversationKey: this._conversationKey,
      credentials: this.credentials,
      message: { type: "edit", editOf: messageId, text: newText },
      conversation: this.conversationId,
    });
  };

  private _handleReact = (
    messageId: string,
    emoji: string,
    remove?: boolean,
  ) => {
    if (!this._conversationKey || !this.credentials) return;
    sendMessageWithKey({
      conversationKey: this._conversationKey,
      credentials: this.credentials,
      message: { type: "reaction", reactTo: messageId, emoji, remove },
      conversation: this.conversationId,
    }).catch((err) => console.error("Failed to send reaction", err));
  };

  private _handleSendLocation = (
    latitude: number,
    longitude: number,
    label?: string,
  ) => {
    if (!this._conversationKey || !this.credentials) return;
    sendMessageWithKey({
      conversationKey: this._conversationKey,
      credentials: this.credentials,
      message: {
        type: "text",
        text: "",
        attachments: [{ type: "location", latitude, longitude, label }],
      },
      conversation: this.conversationId,
    }).catch((err) => console.error("Failed to send location", err));
  };

  private _handleInputActivity = () => {
    this._typingNotifier?.onInput();
  };

  private _handleAvatarClick = (authorId: string) => {
    this._profileAuthorId = authorId;
    this.requestUpdate();
  };

  private _handleShowParticipants = () => {
    this._showParticipantsPopup = true;
    this.requestUpdate();
  };

  private _handleCloseParticipants = () => {
    this._showParticipantsPopup = false;
    this.requestUpdate();
  };

  private _handleSecretIdentity = () => {
    if (!this.credentials) return;
    this._showSecretIdentityPopup = true;
    this._qrCodeDataUrl = "";
    this._transferUrl = "";
    this._copiedTransferUrl = false;
    this.requestUpdate();

    generateTransferUrl(this.credentials).then(async (url) => {
      this._transferUrl = url;
      try {
        const QRCode = (await import("qrcode")).default;
        this._qrCodeDataUrl = await QRCode.toDataURL(url, {
          width: 184,
          margin: 1,
        });
      } catch (err) {
        console.error("Failed to generate QR code", err);
      }
      this.requestUpdate();
    });
  };

  private _handleImportIdentity = () => {
    this._showImportIdentityPopup = true;
    this._importing = false;
    this.requestUpdate();
  };

  private _handleCopyTransferUrl = () => {
    if (!this._transferUrl) return;
    navigator.clipboard.writeText(this._transferUrl).then(() => {
      this._copiedTransferUrl = true;
      this.requestUpdate();
      setTimeout(() => {
        this._copiedTransferUrl = false;
        this.requestUpdate();
      }, 2000);
    });
  };

  private _handleImportKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      this._handleImportSubmit();
    }
  };

  private _handleImportSubmit = async () => {
    const input = this.querySelector("#import-identity-input") as
      | HTMLInputElement
      | null;
    const v = input?.value?.trim();
    if (!v) {
      alert("Please paste your secret key or transfer URL");
      return;
    }
    this._importing = true;
    this.requestUpdate();
    try {
      const creds = await importIdentity(v);
      if (creds) {
        saveCredentials("aliceAndBotCredentials", creds);
        this.credentials = creds;
        this._showImportIdentityPopup = false;
        this.dispatchEvent(
          new CustomEvent("import-identity-success", {
            bubbles: true,
            composed: true,
            detail: { credentials: creds },
          }),
        );
        this._teardown();
        this._setupSubscriptions();
      } else {
        alert("Invalid secret key or transfer URL");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to import identity");
    } finally {
      this._importing = false;
      this.requestUpdate();
    }
  };

  private _handleParticipantClick = (authorId: string) => {
    this._showParticipantsPopup = false;
    this._profileAuthorId = authorId;
    this.requestUpdate();
  };

  private _handleCopyParticipant = async (e: Event, key: string) => {
    e.stopPropagation();
    await copyToClipboard(key);
    this._copiedParticipantId = key;
    this.requestUpdate();
    setTimeout(() => {
      this._copiedParticipantId = null;
      this.requestUpdate();
    }, 1500);
  };

  private _handleStartCall = () => {
    this._voiceCall?.startCall();
  };
  private _handleAcceptCall = () => {
    this._voiceCall?.acceptCall();
  };
  private _handleRejectCall = () => {
    this._voiceCall?.rejectCall();
  };
  private _handleEndCall = () => {
    this._voiceCall?.endCall();
  };
  private _handleToggleMute = () => {
    this._voiceCall?.toggleMute();
  };

  private _closeProfile = () => {
    this._profileAuthorId = null;
    this.requestUpdate();
  };

  override render(): TemplateResult | typeof nothing {
    if (!this.credentials || !this.conversationId) return nothing;
    const isDark = this._effectiveDark;
    if (this._convNotFound) {
      return notFoundHtml(this.customColors, isDark);
    }
    if (!this._hasAccess) {
      return accessDeniedHtml(this.onClose, this.customColors, isDark);
    }

    const { chatMessages, activeSpinners, activeProgress, activeStreams } = this
      ._processMessages();

    return html`
      <chat-box
        .messages="${chatMessages}"
        .participants="${this._participants.map((p) => ({
          publicSignKey: p.publicSignKey,
          name: resolveParticipantName(p, this._identityDetails),
          avatar: resolveParticipantAvatar(p, this._identityDetails),
        }))}"
        .canLoadMore="${this._canLoadMore}"
        .loadMore="${this._loadMore}"
        .userId="${this.credentials.publicSignKey}"
        .credentials="${this.credentials}"
        .onSend="${this._handleSend}"
        .onSendWithAttachments="${this._handleSendWithAttachments}"
        .onClose="${this.onClose}"
        .title="${this._conversationTitle}"
        .typingUsers="${this._typingNames}"
        .isLoading="${!this._messages}"
        .darkModeOverride="${this.darkModeOverride}"
        .customColors="${this.customColors}"
        .onDecryptAttachment="${this._handleDecryptAttachment}"
        .enableAttachments="${this.enableAttachments}"
        .enableAudioRecording="${this.enableAudioRecording}"
        .enableVoiceCall="${this.enableVoiceCall}"
        .voiceCallState="${this._voiceCall?.getState() ?? "idle"}"
        .voiceCallDuration="${this._voiceCall?.getDuration() ?? 0}"
        .voiceCallMuted="${this._voiceCall?.getMuted() ?? false}"
        .remoteStream="${this._voiceCall?.getRemoteStream() ?? null}"
        .onStartCall="${this._handleStartCall}"
        .onAcceptCall="${this._handleAcceptCall}"
        .onRejectCall="${this._handleRejectCall}"
        .onEndCall="${this._handleEndCall}"
        .onToggleMute="${this._handleToggleMute}"
        .onEdit="${this._handleEdit}"
        .onReact="${this._handleReact}"
        .onSendLocation="${this._handleSendLocation}"
        .onInputActivity="${this._handleInputActivity}"
        .onAvatarClick="${this._handleAvatarClick}"
        .activeSpinners="${activeSpinners}"
        .activeProgress="${activeProgress}"
        .activeStreams="${activeStreams}"
        .isGroupChat="${this._isGroupChat}"
        .isDark="${isDark}"
        .emptyMessage="${this.emptyMessage}"
        @show-participants="${this._handleShowParticipants}"
        @secret-identity="${this._handleSecretIdentity}"
        @import-identity="${this._handleImportIdentity}"
      ></chat-box>
      ${this._profileAuthorId
        ? html`
          <user-profile-popup
            .authorId="${this._profileAuthorId}"
            .authorName="${resolveName(this._identityDetails)(
              this._profileAuthorId,
            )}"
            .authorAvatar="${this._identityDetails[this._profileAuthorId]
              ?.avatar ?? ""}"
            .isDark="${isDark}"
            .onClose="${this._closeProfile}"
            .onChatWith="${this.onChatWith}"
          ></user-profile-popup>
        `
        : nothing} ${this._showParticipantsPopup
        ? html`
          <div style="${participantsOverlayStyle}" @click="${this
            ._handleCloseParticipants}">
            <div style="${participantsPopupStyle(isDark)}" @click="${(
              e: Event,
            ) => e.stopPropagation()}">
              <h3 style="${popupTitleStyle(isDark)}">Participants</h3>
              <div style="${participantsListStyle}">
                ${this._participants.map((p) => {
                  const name = resolveParticipantName(p, this._identityDetails);
                  const avatar = resolveParticipantAvatar(
                    p,
                    this._identityDetails,
                  );
                  const baseColor = avatarColor(p.publicSignKey, isDark);
                  const isCopied =
                    this._copiedParticipantId === p.publicSignKey;
                  return html`
                    <div
                      style="${participantRowStyle(isDark)}"
                      @click="${() =>
                        this._handleParticipantClick(p.publicSignKey)}"
                      @mouseover="${(e: MouseEvent) => {
                        const target = e.currentTarget as HTMLElement;
                        target.style.background = isDark
                          ? "rgba(255,255,255,0.06)"
                          : "rgba(0,0,0,0.05)";
                      }}"
                      @mouseout="${(e: MouseEvent) => {
                        const target = e.currentTarget as HTMLElement;
                        target.style.background = isDark
                          ? "rgba(255,255,255,0.02)"
                          : "rgba(0,0,0,0.02)";
                      }}"
                    >
                      <div style="${participantInfoStyle}">
                        <chat-avatar
                          .image="${avatar}"
                          .name="${name}"
                          .baseColor="${baseColor}"
                          .isDark="${isDark}"
                        ></chat-avatar>
                        <div style="${participantMetaStyle}">
                          <div style="${participantNameStyle(
                            isDark,
                          )}">${name}</div>
                          <div style="${participantIdStyle(
                            isDark,
                          )}">${compactPublicKey(p.publicSignKey)}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        style="${copyButtonStyle(isDark)}"
                        @click="${(e: Event) =>
                          this._handleCopyParticipant(e, p.publicSignKey)}"
                      >
                        ${isCopied ? "Copied!" : "Copy ID"}
                      </button>
                    </div>
                  `;
                })}
              </div>
              <button
                type="button"
                style="${closeButtonStyle(isDark)}"
                @click="${this._handleCloseParticipants}"
              >
                Close
              </button>
            </div>
          </div>
        `
        : nothing} ${this._showSecretIdentityPopup && this.credentials
        ? html`
          <div style="${participantsOverlayStyle}" @click="${() => {
            this._showSecretIdentityPopup = false;
            this.requestUpdate();
          }}">
            <div style="${participantsPopupStyle(isDark)}" @click="${(
              e: Event,
            ) => e.stopPropagation()}">
              <h3 style="${popupTitleStyle(isDark)}">Export Identity</h3>
              <p style="font-size:13px;opacity:0.9;text-align:center;line-height:1.4">
                Scan this QR code with your mobile device to open Alice&Bot with your
                export identity.
              </p>
              <div
                style="display:flex;justify-content:center;align-items:center;width:200px;height:200px;background:#ffffff;border-radius:8px;padding:8px;margin: 0 auto;"
              >
                ${this._qrCodeDataUrl
                  ? html`
                    <img
                      src="${this._qrCodeDataUrl}"
                      alt="Export Identity QR Code"
                      style="width:100%;height:100%"
                    />
                  `
                  : html`
                    <div style="color:#000000;font-size:14px">Generating...</div>
                  `}
              </div>
              <div
                style="display:flex;flex-direction:column;gap:8px;width:100%;align-items:center"
              >
                <button
                  type="button"
                  style="${copyButtonStyle(
                    isDark,
                  )};width:100%;padding:10px;border-radius:8px;cursor:pointer"
                  ?disabled="${!this._transferUrl}"
                  @click="${this._handleCopyTransferUrl}"
                >
                  ${this._copiedTransferUrl
                    ? "Copied!"
                    : "Continue on another device"}
                </button>
                <button
                  type="button"
                  style="${closeButtonStyle(
                    isDark,
                  )};width:100%;padding:10px;border-radius:8px;cursor:pointer"
                  @click="${() => {
                    this._showSecretIdentityPopup = false;
                    this.requestUpdate();
                  }}"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        `
        : nothing} ${this._showImportIdentityPopup
        ? html`
          <div style="${participantsOverlayStyle}" @click="${() => {
            this._showImportIdentityPopup = false;
            this.requestUpdate();
          }}">
            <div style="${participantsPopupStyle(isDark)}" @click="${(
              e: Event,
            ) => e.stopPropagation()}">
              <h3 style="${popupTitleStyle(isDark)}">Import Identity</h3>
              <p style="font-size:13px;opacity:0.9;text-align:center;line-height:1.4">
                Paste your secret key, credentials JSON, or transfer URL to import your
                identity.
              </p>
              <input
                type="text"
                id="import-identity-input"
                placeholder="Paste secret key or URL here"
                style="width:100%;padding:10px;border-radius:8px;border:1px solid ${isDark
                  ? "#4b5563"
                  : "#d1d5db"};background:${isDark
                  ? "#2a2a2a"
                  : "#ffffff"};color:${isDark
                  ? "#ffffff"
                  : "#000000"};font-size:14px"
                @keydown="${this._handleImportKeyDown}"
              />
              <div style="display:flex;gap:8px;justify-content:center;width:100%">
                <button
                  type="button"
                  style="${closeButtonStyle(
                    isDark,
                  )};flex:1;padding:10px;border-radius:8px;cursor:pointer"
                  @click="${() => {
                    this._showImportIdentityPopup = false;
                    this.requestUpdate();
                  }}"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  id="import-identity-submit-btn"
                  style="${copyButtonStyle(
                    isDark,
                  )};flex:1;padding:10px;border-radius:8px;background:${isDark
                    ? "#3b82f6"
                    : "#2563eb"};color:#ffffff;cursor:pointer"
                  ?disabled="${this._importing}"
                  @click="${this._handleImportSubmit}"
                >
                  ${this._importing ? "Importing..." : "Import"}
                </button>
              </div>
            </div>
          </div>
        `
        : nothing}
    `;
  }
}

if (!customElements.get("alice-connected-chat")) {
  customElements.define("alice-connected-chat", ConnectedChat);
}
