import { html, LitElement, nothing, type TemplateResult } from "lit";
import { sortKey } from "@uri/gamla";
import type {
  Attachment,
  Credentials,
  DecipheredMessage,
} from "../../protocol/src/clientApi.ts";
import {
  downloadAttachment,
  sendMessageWithKey,
  uploadAttachment,
} from "../../protocol/src/clientApi.ts";
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
import "./chat-box.ts";
import type {
  AbstracChatMessage,
  ActiveProgress,
  ActiveSpinner,
  ActiveStream,
  CustomColors,
  EditHistoryEntry,
} from "./types.ts";

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

const msgToUIMessage =
  (details: Record<string, { name: string; avatar?: string }>) =>
  (msg: DecipheredMessage): AbstracChatMessage => ({
    id: msg.id,
    authorId: msg.publicSignKey,
    authorName: details[msg.publicSignKey]?.name ??
      compactPublicKey(msg.publicSignKey),
    authorAvatar: details[msg.publicSignKey]?.avatar,
    text: msg.text,
    timestamp: msg.timestamp,
    attachments: hasAttachments(msg) ? msg.attachments : undefined,
  });

const msgToUIMessageWithHistory =
  (details: Record<string, { name: string; avatar?: string }>) =>
  (
    { msg, editHistory }: {
      msg: DecipheredMessage;
      editHistory?: EditHistoryEntry[];
    },
  ): AbstracChatMessage => ({
    ...msgToUIMessage(details)(msg),
    editHistory,
  });

type UiOverride = {
  active?: boolean;
  percentage?: number;
  text?: string;
  type?: string;
};

const latestSpinners = (
  messages: DecipheredMessage[],
  details: Record<string, { name: string; avatar?: string }>,
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
        authorName: details[m.publicSignKey]?.name ??
          compactPublicKey(m.publicSignKey),
        text: m.text,
        elementId: m.elementId,
        timestamp: m.timestamp,
        active: override?.active ?? m.active,
      };
    });
};

const latestProgress = (
  messages: DecipheredMessage[],
  details: Record<string, { name: string; avatar?: string }>,
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
        authorName: details[m.publicSignKey]?.name ??
          compactPublicKey(m.publicSignKey),
        text: m.text,
        percentage: override?.percentage ?? m.percentage,
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

const standaloneSpinnerEntries = (
  uiElements: UiElement[],
  knownIds: Set<string>,
): ActiveSpinner[] =>
  uiElements
    .filter((el) =>
      el.type === "spinner" && !knownIds.has(el.elementId) &&
      el.active !== false
    )
    .map((el) => ({
      authorName: "",
      text: el.text ?? "",
      elementId: el.elementId,
      timestamp: el.updatedAt,
      active: el.active !== false,
    }));

const standaloneStreamEntries = (
  streams: EphemeralStreamEvent[],
  knownIds: Set<string>,
  details: Record<string, { name: string; avatar?: string }>,
): ActiveStream[] =>
  streams
    .filter((el) =>
      !knownIds.has(el.elementId) &&
      (el.active !== false || (el.text && el.text.trim() !== ""))
    )
    .map((el) => ({
      authorName: el.authorId
        ? (details[el.authorId]?.name || "Assistant")
        : "Assistant",
      authorAvatar: el.authorId ? details[el.authorId]?.avatar : undefined,
      authorPublicKey: el.authorId,
      text: el.text ?? "",
      elementId: el.elementId,
      timestamp: el.updatedAt,
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
  private _canLoadMore = false;
  private _loadMore: () => void = () => {};
  private _typingNames: string[] = [];
  private _identityDetails: Record<
    string,
    { name: string; avatar?: string }
  > = {};
  private _ephemeralStreams: EphemeralStreamEvent[] = [];
  private _uiElements: UiElement[] = [];
  private _hasAccess = true;
  private _convNotFound = false;
  private _conversationTitle = "Chat";
  private _isGroupChat = false;
  private _progressMax = new Map<string, number>();

  private _unsubs: (() => void)[] = [];
  private _typingNotifier: ReturnType<typeof createTypingNotifier> | null =
    null;

  override createRenderRoot(): HTMLElement {
    return this;
  }

  override connectedCallback() {
    super.connectedCallback();
    this.style.display = "flex";
    this.style.flexDirection = "column";
    this.style.flexGrow = "1";
    this.style.minHeight = "0";
    this._setupSubscriptions();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._teardown();
  }

  override willUpdate(changed: Map<string, unknown>) {
    if (
      changed.has("darkModeOverride") && this.darkModeOverride !== undefined
    ) {
      this.isDark = this.darkModeOverride;
    }
  }

  override updated(changed: Map<string, unknown>) {
    if (changed.has("credentials") || changed.has("conversationId")) {
      this._teardown();
      this._setupSubscriptions();
    }
  }

  private _teardown() {
    this._unsubs.forEach((u) => u());
    this._unsubs = [];
    this._typingNotifier?.stop();
    this._typingNotifier = null;
    this._messagesUnsub?.();
    this._messagesUnsub = null;
    this._identityUnsub?.();
    this._identityUnsub = null;
    this._lastIdentityKeys = "";
    this._progressMax.clear();
  }

  private _setupSubscriptions() {
    if (!this.credentials || !this.conversationId) return;

    const { publicSignKey } = this.credentials;

    this._typingNotifier = createTypingNotifier(
      this.conversationId,
      publicSignKey,
    );

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
          this.requestUpdate();
        },
      ),
    );

    this._unsubs.push(
      accessDb().subscribeQuery(
        {
          keys: {
            $: {
              where: {
                "owner.publicSignKey": publicSignKey,
                conversation: this.conversationId,
              },
            },
          },
        },
        ({ data }) => {
          if (!data) return;
          this._hasAccess = (data.keys.length ?? 0) > 0;
          this.requestUpdate();
        },
      ),
    );

    this._unsubs.push(
      subscribeConversationKey(
        this.conversationId,
        this.credentials,
        (key) => {
          this._conversationKey = key;
          this._resubscribeMessages();
          this.requestUpdate();
        },
      ),
    );

    this._unsubs.push(
      subscribeTypingStates(
        this.conversationId,
        publicSignKey,
        (names) => {
          this._typingNames = names;
          this.requestUpdate();
        },
      ),
    );

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
        this._messages = messages;
        this._canLoadMore = canLoadMore;
        this._loadMore = loadMore;
        this._resubscribeIdentities();
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
    return {
      chatMessages: foldEdits(messages.filter(isTextOrEdit)).map(
        msgToUIMessageWithHistory(details),
      ),
      activeSpinners: [
        ...latestSpinners(messages, details, overrides),
        ...standaloneSpinnerEntries(this._uiElements, knownIds),
      ],
      activeProgress: enforceMonotonic(this._progressMax, [
        ...latestProgress(messages, details, overrides),
        ...standaloneProgressEntries(this._uiElements, knownIds),
      ]),
      activeStreams: standaloneStreamEntries(
        this._ephemeralStreams,
        knownIds,
        details,
      ),
    };
  }

  private _handleSend = (text: string) => {
    if (!this._conversationKey || !this.credentials) return;
    sendMessageWithKey({
      conversationKey: this._conversationKey,
      credentials: this.credentials,
      message: { type: "text", text },
      conversation: this.conversationId,
    }).catch((err) => console.error("Failed to send message", err));
    this._typingNotifier?.onBlurOrSend();
  };

  private _handleSendWithAttachments = async (
    text: string,
    files: File[],
    audioDuration?: number,
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
      message: { type: "text", text, attachments },
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

  override render(): TemplateResult | typeof nothing {
    if (!this.credentials || !this.conversationId) return nothing;
    if (this._convNotFound) {
      return notFoundHtml(this.customColors, this.isDark);
    }
    if (!this._hasAccess) {
      return accessDeniedHtml(this.onClose, this.customColors, this.isDark);
    }

    const { chatMessages, activeSpinners, activeProgress, activeStreams } = this
      ._processMessages();

    return html`
      <chat-box
        .messages="${chatMessages}"
        .canLoadMore="${this._canLoadMore}"
        .loadMore="${this._loadMore}"
        .userId="${this.credentials.publicSignKey}"
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
        .onEdit="${this._handleEdit}"
        .onSendLocation="${this._handleSendLocation}"
        .onInputActivity="${this._handleInputActivity}"
        .activeSpinners="${activeSpinners}"
        .activeProgress="${activeProgress}"
        .activeStreams="${activeStreams}"
        .isGroupChat="${this._isGroupChat}"
        .isDark="${this.isDark}"
        .emptyMessage="${this.emptyMessage}"
      ></chat-box>
    `;
  }
}

customElements.define("alice-connected-chat", ConnectedChat);
