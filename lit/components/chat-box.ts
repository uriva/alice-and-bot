import { html, LitElement, nothing, type TemplateResult } from "lit";
import { empty } from "@uri/gamla";
import { maxTextLength } from "../../protocol/src/attachmentLimits.ts";
import {
  centerFillStyle,
  chatContainerStyle,
  contentMaxWidthStyle,
  defaultPrimary,
  isLightColor,
  loadingStyle,
} from "./design.ts";
import {
  faCamera,
  faFile,
  faImage,
  faMapMarkerAlt,
  faMicrophone,
  faMicrophoneSlash,
  faPaperclip,
  faPaperPlane,
  faPhoneAlt,
  faStop,
} from "./icons.ts";
import "./chat-message.ts";
import "./chat-typing-indicator.ts";
import type {
  AbstracChatMessage,
  ActiveProgress,
  ActiveSpinner,
  ActiveStream,
  CustomColors,
  TimelineEntry,
} from "./types.ts";
import {
  buildTimeline,
  charCountThreshold,
  estimateSerializedLength,
  formatDuration,
  playNotificationSound,
  recordingExtension,
  recordingMimeType,
  showAuthorName,
} from "./utils.ts";

const oneMinuteMs = 60_000;

const indicatorColor = (isDark: boolean, color?: string) =>
  color ?? (isDark ? "#cbd5e1" : "#475569");

const indicatorTextStyle = (isDark: boolean, color?: string) =>
  `padding:6px 12px 6px 44px;color:${
    indicatorColor(isDark, color)
  };font-size:14px`;

const linearBarTrackStyle = (isDark: boolean, color?: string) =>
  `width:200px;height:8px;border:1px solid ${
    indicatorColor(isDark, color)
  };border-radius:4px;margin-top:4px;overflow:hidden`;

const linearBarFillStyle = (
  percentage: number,
  isDark: boolean,
  color?: string,
) =>
  `height:100%;background-color:${
    indicatorColor(isDark, color)
  };border-radius:4px;width:${
    Math.min(100, Math.max(0, percentage * 100))
  }%;transition:width 0.3s ease`;

const indeterminateBarStyle = (isDark: boolean, color?: string) =>
  `height:100%;width:60px;background-color:${
    indicatorColor(isDark, color)
  };border-radius:4px;animation:indeterminate 1.2s linear infinite`;

const renderSpinnerIndicator = (
  spinner: ActiveSpinner,
  isDark: boolean,
  hideNames?: boolean,
  isGroupChat?: boolean,
  color?: string,
) =>
  html`
    <div style="${indicatorTextStyle(isDark, color)}">
      <span>${showAuthorName(hideNames, isGroupChat)
        ? `${spinner.authorName}: ${spinner.text}`
        : spinner.text}</span>
      ${spinner.active
        ? html`
          <div style="${linearBarTrackStyle(
            isDark,
            color,
          )}"><div style="${indeterminateBarStyle(isDark, color)}"></div></div>
        `
        : html`
          <div style="${linearBarTrackStyle(
            isDark,
            color,
          )}"><div style="${linearBarFillStyle(1, isDark, color)}"></div></div>
        `}
    </div>
  `;

const renderProgressIndicator = (
  progress: ActiveProgress,
  isDark: boolean,
  hideNames?: boolean,
  isGroupChat?: boolean,
  color?: string,
) =>
  html`
    <div style="${indicatorTextStyle(isDark, color)}">
      <span>${showAuthorName(hideNames, isGroupChat)
        ? `${progress.authorName}: ${progress.text}`
        : progress.text} (${Math.round(progress.percentage * 100)}%)</span>
      <div style="${linearBarTrackStyle(
        isDark,
        color,
      )}"><div style="${linearBarFillStyle(
        progress.percentage,
        isDark,
        color,
      )}"></div></div>
    </div>
  `;

const spinnerKeyframes =
  `@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}`;
const indeterminateKeyframes =
  `@keyframes indeterminate{0%{transform:translateX(-100%)}100%{transform:translateX(200px)}}`;
const pulseKeyframes = `@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`;

const spinnerEl = (isDark: boolean, color?: string) =>
  html`
    <style>
    ${spinnerKeyframes}
    </style><div
      style="width:40px;height:40px;border:4px solid ${isDark
        ? "#ffffff1a"
        : "#00000010"};border-top:4px solid ${color ?? (isDark
          ? "#ffffff80"
          : "#00000040")};border-radius:50%;animation:spin 1s linear infinite"
    >
    </div>
  `;

const sendingAudioIndicator = (primaryColor: string) =>
  html`
    <div style="display:flex;flex-direction:row-reverse;gap:6px">
      <div
        style="background:${primaryColor};border-radius:16px;padding:10px 14px;display:flex;align-items:center;gap:10px;opacity:0.7"
      >
        <style>
        ${spinnerKeyframes}
        </style>
        <div
          style="width:20px;height:20px;border:3px solid ${isLightColor(
              primaryColor,
            )
            ? "#00000010"
            : "#ffffff1a"};border-top:3px solid ${isLightColor(primaryColor)
            ? "#00000040"
            : "#ffffff80"};border-radius:50%;animation:spin 1s linear infinite"
        >
        </div>
        <span style="color:${isLightColor(primaryColor)
          ? "#222"
          : "#fff"};font-size:13px">Sending audio...</span>
      </div>
    </div>
  `;

const titleStyle = (isDark: boolean, custom?: CustomColors) =>
  `display:flex;align-items:center;justify-content:center;font-weight:bold;padding:12px 0;font-size:16px;border-bottom:1px solid ${
    isDark ? "#ffffff15" : "#00000015"
  };transition:border-color 0.2s;color:${
    custom?.text ?? (isDark ? "#f4f4f4" : "#222")
  }`;

const headerButtonStyle =
  "background:transparent;border:none;cursor:pointer;color:inherit;display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;padding:0";

const messageContainerStyle = (isDark: boolean, custom?: CustomColors) =>
  `flex-grow:1;display:flex;flex-direction:column;overflow-y:auto;overflow-x:hidden;min-height:0;scrollbar-color:${
    custom?.scrollbarColor ?? (isDark ? "#2a2a2a #111" : "#cbd5e1 #e2e8f0")
  };scrollbar-width:thin`;

const sendButtonStyle = (isDark: boolean, custom?: CustomColors) =>
  `width:44px;height:44px;min-width:44px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:18px;transition:background 0.2s,color 0.2s;flex-shrink:0;background:${
    custom?.inputBackground ?? (isDark ? "#111" : "#ffffff")
  };color:${isDark ? "#fff" : "#222"}`;

const recordingIndicatorStyle = (isDark: boolean) =>
  `background:${
    isDark ? "#7f1d1d" : "#991b1b"
  };color:#fff;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;font-size:14px`;

const attachMenuStyle = (isDark: boolean) =>
  `position:absolute;bottom:calc(100% + 8px);right:0;background:${
    isDark ? "#1a1a1a" : "#ffffff"
  };border:1px solid ${
    isDark ? "#2a2a2a" : "#e5e7eb"
  };border-radius:8px;box-shadow:0 4px 12px ${
    isDark ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.15)"
  };z-index:200;min-width:140px;overflow:hidden`;

const attachMenuItemStyle = (isDark: boolean) =>
  `display:flex;align-items:center;gap:8px;width:100%;padding:10px 14px;background:transparent;border:none;cursor:pointer;font-size:14px;color:${
    isDark ? "#e5e7eb" : "#1a1a1a"
  };white-space:nowrap`;

const charCountStyle = (isDark: boolean, isOver: boolean) =>
  `text-align:right;font-size:12px;padding:2px 8px;color:${
    isOver ? "#ef4444" : (isDark ? "#9ca3af" : "#6b7280")
  }`;

const textareaStyle = (
  isDark: boolean,
  custom?: CustomColors,
  enableAttachments?: boolean,
  height = 44,
  overflow: string = "hidden",
) =>
  `width:100%;padding:${
    enableAttachments ? "10px 36px 10px 16px" : "10px 16px"
  };border:none;border-radius:22px;background:${
    custom?.inputBackground ?? (isDark ? "#111" : "#ffffff")
  };color:${
    isDark ? "#f3f4f6" : "#1e293b"
  };font-size:16px;outline:none;resize:none;box-sizing:border-box;height:${height}px;min-height:44px;margin:0;overflow-y:${overflow};overflow-x:hidden;max-height:200px;line-height:1.5;transition:background 0.2s,color 0.2s;font-family:inherit;letter-spacing:0.1px;scrollbar-color:${
    custom?.scrollbarColor ?? (isDark ? "#2a2a2a #111" : "#cbd5e1 #e2e8f0")
  };scrollbar-width:thin`;

const kebabHoverCss =
  `.msg-bubble .msg-kebab{opacity:0;transition:opacity .15s}.msg-bubble:hover .msg-kebab,.msg-kebab[data-open]{opacity:.7}`;

const isMobileCheck = () =>
  typeof globalThis.matchMedia === "function" &&
  globalThis.matchMedia("(max-width: 768px)").matches;

const voiceCallLabel = (state: string, duration: number) => {
  if (state === "calling") return "Calling...";
  if (state === "ringing") return "Incoming call...";
  if (state === "connecting") return "Connecting...";
  if (state === "active") {
    const dur = duration > 0
      ? ` (${Math.floor(duration / 60)}:${
        (duration % 60).toString().padStart(2, "0")
      })`
      : "";
    return `Voice Call Active${dur}`;
  }
  return "";
};

const allMessagesFrom = (
  messages: AbstracChatMessage[],
  optimistic: AbstracChatMessage[],
  userId: string,
) => {
  if (empty(optimistic)) return messages;
  const realTexts = new Set(
    messages.filter((m) => m.authorId === userId).map((m) => m.text),
  );
  const remaining = optimistic.filter((o) => !realTexts.has(o.text));
  return empty(remaining) ? messages : [...messages, ...remaining];
};

const pruneOptimistic = (
  messages: AbstracChatMessage[],
  optimistic: AbstracChatMessage[],
  userId: string,
) => {
  if (empty(optimistic)) return optimistic;
  const realTexts = new Set(
    messages.filter((m) => m.authorId === userId).map((m) => m.text),
  );
  const remaining = optimistic.filter((o) => !realTexts.has(o.text));
  return remaining.length === optimistic.length ? optimistic : remaining;
};

export class ChatBox extends LitElement {
  static override properties = {
    messages: { attribute: false },
    canLoadMore: { type: Boolean },
    loadMore: { attribute: false },
    userId: { attribute: false },
    onSend: { attribute: false },
    onSendWithAttachments: { attribute: false },
    onClose: { attribute: false },
    title: {},
    emptyMessage: { attribute: false },
    typingUsers: { type: Array },
    onInputActivity: { attribute: false },
    isLoading: { type: Boolean },
    darkModeOverride: { type: Boolean },
    customColors: { attribute: false },
    onDecryptAttachment: { attribute: false },
    enableAttachments: { type: Boolean },
    enableAudioRecording: { type: Boolean },
    enableVoiceCall: { type: Boolean },
    voiceCallState: {},
    voiceCallDuration: { type: Number },
    voiceCallMuted: { type: Boolean },
    remoteStream: { attribute: false },
    onStartCall: { attribute: false },
    onAcceptCall: { attribute: false },
    onRejectCall: { attribute: false },
    onEndCall: { attribute: false },
    onToggleMute: { attribute: false },
    onEdit: { attribute: false },
    onSendLocation: { attribute: false },
    activeSpinners: { type: Array },
    activeProgress: { type: Array },
    activeStreams: { type: Array },
    isGroupChat: { type: Boolean },
    disableAutoFocus: { type: Boolean },
    isDark: { type: Boolean },
    _input: { state: true },
    _pendingFiles: { state: true },
    _showAttachMenu: { state: true },
    _isRecording: { state: true },
    _recordingDuration: { state: true },
    _isRecordingLocked: { state: true },
    _swipeOffset: { state: true },
    _optimisticMessages: { state: true },
    _isSending: { state: true },
    _fetchingMore: { state: true },
    _textareaHeight: { state: true },
    _textareaOverflow: { state: true },
  };

  declare messages: AbstracChatMessage[];
  declare canLoadMore: boolean;
  declare loadMore: () => void;
  declare userId: string;
  declare onSend: (input: string) => void;
  declare onSendWithAttachments:
    | ((
      input: string,
      files: File[],
      audioDuration?: number,
    ) => Promise<void>)
    | undefined;
  declare onClose: (() => void) | undefined;
  declare title: string;
  declare emptyMessage: string | undefined;
  declare typingUsers: string[];
  declare onInputActivity: (() => void) | undefined;
  declare isLoading: boolean;
  declare darkModeOverride: boolean | undefined;
  declare customColors: CustomColors | undefined;
  declare onDecryptAttachment:
    | ((url: string) => Promise<string>)
    | undefined;
  declare enableAttachments: boolean;
  declare enableAudioRecording: boolean;
  declare enableVoiceCall: boolean;
  declare voiceCallState: string;
  declare voiceCallDuration: number;
  declare voiceCallMuted: boolean;
  declare remoteStream: MediaStream | null | undefined;
  declare onStartCall: (() => void) | undefined;
  declare onAcceptCall: (() => void) | undefined;
  declare onRejectCall: (() => void) | undefined;
  declare onEndCall: (() => void) | undefined;
  declare onToggleMute: (() => void) | undefined;
  declare onEdit:
    | ((messageId: string, newText: string) => void)
    | undefined;
  declare onSendLocation:
    | ((lat: number, lng: number, label?: string) => void)
    | undefined;
  declare activeSpinners: ActiveSpinner[];
  declare activeProgress: ActiveProgress[];
  declare activeStreams: ActiveStream[];
  declare isGroupChat: boolean;
  declare disableAutoFocus: boolean;
  declare isDark: boolean;

  declare private _input: string;
  declare private _pendingFiles: File[];
  declare private _showAttachMenu: boolean;
  declare private _isRecording: boolean;
  declare private _recordingDuration: number;
  declare private _isRecordingLocked: boolean;
  declare private _swipeOffset: { x: number; y: number };
  declare private _optimisticMessages: AbstracChatMessage[];
  declare private _isSending: boolean;
  declare private _fetchingMore: boolean;
  declare private _textareaHeight: number;
  declare private _textareaOverflow: string;

  constructor() {
    super();
    this.messages = [];
    this.canLoadMore = false;
    this.loadMore = () => {};
    this.userId = "";
    this.onSend = () => {};
    this.title = "";
    this.typingUsers = [];
    this.isLoading = false;
    this.enableAttachments = false;
    this.enableAudioRecording = false;
    this.enableVoiceCall = false;
    this.voiceCallState = "idle";
    this.voiceCallDuration = 0;
    this.voiceCallMuted = false;
    this.activeSpinners = [];
    this.activeProgress = [];
    this.activeStreams = [];
    this.isGroupChat = false;
    this.disableAutoFocus = false;
    this.isDark = false;
    this._input = "";
    this._pendingFiles = [];
    this._showAttachMenu = false;
    this._isRecording = false;
    this._recordingDuration = 0;
    this._isRecordingLocked = false;
    this._swipeOffset = { x: 0, y: 0 };
    this._optimisticMessages = [];
    this._isSending = false;
    this._fetchingMore = false;
    this._textareaHeight = 44;
    this._textareaOverflow = "hidden";
  }

  private _messagesContainerEl: HTMLDivElement | null = null;
  private _contentEl: HTMLDivElement | null = null;
  private _inputEl: HTMLTextAreaElement | null = null;
  private _fileInputEl: HTMLInputElement | null = null;
  private _cameraInputEl: HTMLInputElement | null = null;
  private _imageInputEl: HTMLInputElement | null = null;
  private _attachMenuEl: HTMLDivElement | null = null;
  private _remoteAudioEl: HTMLAudioElement | null = null;
  private _mediaRecorder: MediaRecorder | null = null;
  private _audioChunks: Blob[] = [];
  private _stream: MediaStream | null = null;
  private _recordingInterval: number | null = null;
  private _recordingStartTime = 0;
  private _sessionStart = Date.now();
  private _initialLoad = true;
  private _pendingAudioMessageCount: number | null = null;
  private _touchStart: { x: number; y: number } | null = null;
  private _prevActiveSpinnerIds = new Set<string>();
  private _prevMessageCount = 0;
  private _stuckToBottom = true;
  private _loadingMore = false;
  private _prevScrollHeight = 0;
  private _resizeObserver: ResizeObserver | null = null;
  private _escHandler: ((e: KeyboardEvent) => void) | null = null;
  private _attachOutsideHandler: ((e: MouseEvent) => void) | null = null;
  private _isMobile = false;

  override createRenderRoot(): HTMLElement {
    return this;
  }

  override connectedCallback() {
    super.connectedCallback();
    this.style.display = "flex";
    this.style.flexDirection = "column";
    this.style.flexGrow = "1";
    this.style.minHeight = "0";
    this._isMobile = isMobileCheck();
    if (this.onClose) {
      this._escHandler = (e: KeyboardEvent) => {
        if (e.key === "Escape") this.onClose?.();
      };
      globalThis.addEventListener("keydown", this._escHandler);
    }
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    if (this._escHandler) {
      globalThis.removeEventListener("keydown", this._escHandler);
      this._escHandler = null;
    }
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    this._removeAttachOutside();
    if (this._recordingInterval) clearInterval(this._recordingInterval);
  }

  private _removeAttachOutside() {
    if (this._attachOutsideHandler) {
      document.removeEventListener("mousedown", this._attachOutsideHandler);
      this._attachOutsideHandler = null;
    }
  }

  private _scrollToBottom() {
    const el = this._messagesContainerEl;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }

  private _handleScroll = () => {
    const el = this._messagesContainerEl;
    if (!el) return;
    this._stuckToBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    if (!this._loadingMore && el.scrollTop === 0 && this.canLoadMore) {
      this._loadingMore = true;
      this._prevScrollHeight = el.scrollHeight;
      this._fetchingMore = true;
      this.loadMore();
    }
  };

  private _stopRecording(save: boolean) {
    if (this._recordingInterval) {
      clearInterval(this._recordingInterval);
      this._recordingInterval = null;
    }
    const recorder = this._mediaRecorder;
    if (recorder && recorder.state !== "inactive") {
      if (save) {
        recorder.requestData();
        recorder.stop();
      } else {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        recorder.stop();
        this._stream?.getTracks().forEach((t) => t.stop());
      }
    }
    this._isRecording = false;
    this._recordingDuration = 0;
    this._isRecordingLocked = false;
    this._swipeOffset = { x: 0, y: 0 };
    this._touchStart = null;
  }

  private async _startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this._stream = stream;
      const recorder = new MediaRecorder(stream, {
        mimeType: recordingMimeType,
      });
      this._mediaRecorder = recorder;
      this._audioChunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) this._audioChunks.push(e.data);
      };
      recorder.onstop = async () => {
        const capturedDuration = Math.round(
          (Date.now() - this._recordingStartTime) / 1000,
        );
        if (this._audioChunks.length === 0) {
          this._stream?.getTracks().forEach((t) => t.stop());
          return;
        }
        const blob = new Blob(this._audioChunks, { type: recordingMimeType });
        const file = new File(
          [blob],
          `recording-${Date.now()}.${recordingExtension}`,
          { type: recordingMimeType },
        );
        this._stream?.getTracks().forEach((t) => t.stop());
        this._recordingDuration = 0;
        if (this.onSendWithAttachments) {
          this._pendingAudioMessageCount = this.messages.length;
          this._isSending = true;
          await this.onSendWithAttachments(
            "",
            [file],
            capturedDuration > 0 ? capturedDuration : 1,
          );
        }
      };
      recorder.start(100);
      this._isRecording = true;
      this._recordingDuration = 0;
      this._recordingStartTime = Date.now();
      this._recordingInterval = globalThis.setInterval(() => {
        this._recordingDuration = this._recordingDuration + 1;
      }, 1000);
    } catch {
      console.error("Could not access microphone");
    }
  }

  private _resizeTextarea(textarea: HTMLTextAreaElement) {
    textarea.style.height = "auto";
    const scrollHeight = textarea.scrollHeight;
    const singleLine = textarea.value.indexOf("\n") === -1;
    const h = singleLine ? Math.max(scrollHeight, 44) : scrollHeight;
    textarea.style.height = `${h}px`;
    this._textareaHeight = h;
    this._textareaOverflow = singleLine ? "hidden" : "auto";
  }

  private async _handleSend() {
    const text = this._input.trim();
    const files = [...this._pendingFiles];
    if (!text && files.length === 0) return;
    if (files.length === 0 && estimateSerializedLength(text) > maxTextLength) {
      return;
    }
    this._input = "";
    this._textareaHeight = 44;
    this._textareaOverflow = "hidden";
    this._pendingFiles = [];
    this.onInputActivity?.();

    if (files.length > 0 && this.onSendWithAttachments) {
      this._isSending = true;
      await this.onSendWithAttachments(text, files);
      this._isSending = false;
    } else if (text) {
      this._optimisticMessages = [
        ...this._optimisticMessages,
        {
          id: `optimistic-${Date.now()}`,
          authorId: this.userId,
          authorName: "",
          text,
          timestamp: Date.now(),
        },
      ];
      this.onSend(text);
    }

    setTimeout(() => {
      if (this._inputEl) {
        this._inputEl.focus();
        this._inputEl.style.height = "44px";
      }
      this._scrollToBottom();
      requestAnimationFrame(() => this._scrollToBottom());
    }, 0);
  }

  private _onTextareaInput = (e: InputEvent) => {
    this._input = (e.target as HTMLTextAreaElement).value;
    this._resizeTextarea(e.target as HTMLTextAreaElement);
    this.onInputActivity?.();
  };

  private _onTextareaPaste = (e: ClipboardEvent) => {
    if (!this.onSendWithAttachments) return;
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageFiles = items
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((f): f is File => f !== null);
    if (imageFiles.length === 0) return;
    e.preventDefault();
    this._pendingFiles = [...this._pendingFiles, ...imageFiles];
  };

  private _onTextareaKeydown = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (
      (e.key === "PageUp" || e.key === "PageDown") && e.target
    ) {
      const ta = e.target as HTMLTextAreaElement;
      const canScrollUp = ta.scrollTop > 0;
      const canScrollDown = ta.scrollTop + ta.clientHeight < ta.scrollHeight;
      if (
        (e.key === "PageUp" && canScrollUp) ||
        (e.key === "PageDown" && canScrollDown)
      ) {
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey) {
      if (this._isMobile) return;
      const canSend = this._input.trim() || this._pendingFiles.length > 0;
      if (canSend && !this._isSending) this._handleSend();
      e.preventDefault();
    }
    this.onInputActivity?.();
  };

  private _onFileChange = (e: Event) => {
    const files = Array.from((e.target as HTMLInputElement).files ?? []);
    this._pendingFiles = [...this._pendingFiles, ...files];
    (e.target as HTMLInputElement).value = "";
  };

  private _toggleAttachMenu = () => {
    this._showAttachMenu = !this._showAttachMenu;
    if (this._showAttachMenu) {
      this._attachOutsideHandler = (e: MouseEvent) => {
        if (
          this._attachMenuEl &&
          !this._attachMenuEl.contains(e.target as Node)
        ) {
          this._showAttachMenu = false;
          this._removeAttachOutside();
        }
      };
      document.addEventListener("mousedown", this._attachOutsideHandler);
    } else {
      this._removeAttachOutside();
    }
  };

  private _onAttachCamera = () => {
    this._showAttachMenu = false;
    this._removeAttachOutside();
    this._cameraInputEl?.click();
  };

  private _onAttachImage = () => {
    this._showAttachMenu = false;
    this._removeAttachOutside();
    this._imageInputEl?.click();
  };

  private _onAttachDocument = () => {
    this._showAttachMenu = false;
    this._removeAttachOutside();
    this._fileInputEl?.click();
  };

  private _onAttachLocation = () => {
    this._showAttachMenu = false;
    this._removeAttachOutside();
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => this.onSendLocation?.(coords.latitude, coords.longitude),
      () => alert("Could not get your location."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  private _hoverBtnIn = (e: Event) => {
    (e.currentTarget as HTMLElement).style.background =
      "rgba(255,255,255,0.15)";
  };

  private _hoverBtnOut = (e: Event) => {
    (e.currentTarget as HTMLElement).style.background = "transparent";
  };

  private _hoverAttachIn = (e: Event) => {
    (e.currentTarget as HTMLElement).style.background = this.isDark
      ? "#2a2a2a"
      : "#f3f4f6";
  };

  private _hoverAttachOut = (e: Event) => {
    (e.currentTarget as HTMLElement).style.background = "transparent";
  };

  override willUpdate(changed: Map<string, unknown>) {
    if (
      changed.has("darkModeOverride") && this.darkModeOverride !== undefined
    ) {
      this.isDark = this.darkModeOverride;
    }
  }

  override updated(changed: Map<string, unknown>) {
    this._messagesContainerEl = this.querySelector<HTMLDivElement>(
      '[data-testid="message-list"]',
    );
    this._contentEl = this._messagesContainerEl?.querySelector<HTMLDivElement>(
      "[data-content-inner]",
    ) ?? null;
    this._inputEl = this.querySelector<HTMLTextAreaElement>(
      '[data-testid="message-input"]',
    );
    this._fileInputEl = this.querySelector<HTMLInputElement>(
      "[data-file-input]",
    );
    this._cameraInputEl = this.querySelector<HTMLInputElement>(
      "[data-camera-input]",
    );
    this._imageInputEl = this.querySelector<HTMLInputElement>(
      "[data-image-input]",
    );
    this._attachMenuEl = this.querySelector<HTMLDivElement>(
      "[data-attach-wrapper]",
    );
    this._remoteAudioEl = this.querySelector<HTMLAudioElement>(
      "[data-remote-audio]",
    );

    if (this._messagesContainerEl) {
      this._messagesContainerEl.onscroll = this._handleScroll;
    }

    if (this._contentEl && !this._resizeObserver) {
      this._resizeObserver = new ResizeObserver(() => {
        if (this._stuckToBottom) this._scrollToBottom();
      });
      this._resizeObserver.observe(this._contentEl);
    }

    if (!this._isMobile && !this.disableAutoFocus && this._inputEl) {
      if (changed.has("title")) this._inputEl.focus();
    }

    if (this._remoteAudioEl && this.remoteStream) {
      this._remoteAudioEl.srcObject = this.remoteStream;
      this._remoteAudioEl.play().catch(console.error);
    }

    this._optimisticMessages = pruneOptimistic(
      this.messages,
      this._optimisticMessages,
      this.userId,
    );

    if (this._isSending) {
      const hasNewAudio = this.messages.some(
        (m) =>
          m.timestamp > this._sessionStart &&
          m.attachments?.some((a) => a.type === "audio"),
      );
      if (hasNewAudio) {
        this._pendingAudioMessageCount = null;
        this._isSending = false;
      }
    }

    if (this._loadingMore && this._messagesContainerEl) {
      this._messagesContainerEl.scrollTop =
        this._messagesContainerEl.scrollHeight - this._prevScrollHeight;
      this._loadingMore = false;
      this._fetchingMore = false;
    } else {
      this._stuckToBottom = true;
      this._scrollToBottom();
      requestAnimationFrame(() => this._scrollToBottom());
      if (this.messages.length > 0) this._initialLoad = false;
    }

    const currentActive = new Set([
      ...this.activeSpinners.filter((s) => s.active).map((s) => s.elementId),
      ...this.activeProgress.filter((p) => p.percentage < 1).map((p) =>
        p.elementId
      ),
    ]);
    const now = Date.now();
    const justCompleted = [
      ...this.activeSpinners.filter(
        (s) =>
          !s.active && this._prevActiveSpinnerIds.has(s.elementId) &&
          now - s.timestamp > oneMinuteMs,
      ),
      ...this.activeProgress.filter(
        (p) =>
          p.percentage >= 1 && this._prevActiveSpinnerIds.has(p.elementId) &&
          now - p.timestamp > oneMinuteMs,
      ),
    ];
    if (justCompleted.length > 0) playNotificationSound();
    this._prevActiveSpinnerIds = currentActive;

    const prevCount = this._prevMessageCount;
    this._prevMessageCount = this.messages.length;
    if (
      prevCount > 0 &&
      this.messages.length > prevCount &&
      document.hidden &&
      this.messages.slice(prevCount).some((m) => m.authorId !== this.userId)
    ) {
      playNotificationSound();
    }
  }

  override render(): TemplateResult {
    const { isDark, customColors } = this;
    const allMsgs = allMessagesFrom(
      this.messages,
      this._optimisticMessages,
      this.userId,
    );
    const timeline = buildTimeline(
      allMsgs,
      this.activeSpinners,
      this.activeProgress,
      this.activeStreams,
    );

    const hasContent = !!this._input.trim() || this._pendingFiles.length > 0;
    const showMic = this.enableAudioRecording && !hasContent &&
      !this._isRecording;
    const showStop = this._isRecording && !this._isRecordingLocked;
    const showSendBtn = hasContent ||
      (this._isRecording && this._isRecordingLocked);
    const inputBgColor = customColors?.inputBackground ??
      (isDark ? "#111" : "#ffffff");

    const handleButtonClick = () => {
      if (showMic) {
        if (!this._isMobile) this._startRecording();
      } else if (showStop) {
        if (!this._isMobile) this._stopRecording(true);
      } else if (this._isRecordingLocked) {
        this._stopRecording(true);
      } else {
        this._handleSend();
      }
    };

    const handleTouchStart = this._isMobile
      ? (e: TouchEvent) => {
        e.preventDefault();
        if (showSendBtn && !this._isRecordingLocked) return;
        if (this._isRecordingLocked) return;
        const touch = e.touches[0];
        this._touchStart = { x: touch.clientX, y: touch.clientY };
        this._swipeOffset = { x: 0, y: 0 };
        if (showMic) this._startRecording();
      }
      : undefined;

    const handleTouchMove = this._isMobile
      ? (e: TouchEvent) => {
        e.preventDefault();
        if (!this._touchStart || this._isRecordingLocked) return;
        const touch = e.touches[0];
        const dx = touch.clientX - this._touchStart.x;
        const dy = touch.clientY - this._touchStart.y;
        this._swipeOffset = { x: dx, y: dy };
        if (dx < -80) {
          this._stopRecording(false);
        } else if (dy < -60) {
          this._isRecordingLocked = true;
          this._swipeOffset = { x: 0, y: 0 };
        }
      }
      : undefined;

    const handleTouchEnd = this._isMobile
      ? (e: TouchEvent) => {
        e.preventDefault();
        if (showSendBtn && !this._isRecording) {
          this._handleSend();
          return;
        }
        if (this._isRecordingLocked) return;
        if (this._isRecording) this._stopRecording(true);
      }
      : undefined;

    const handleTouchCancel = this._isMobile
      ? (e: TouchEvent) => {
        e.preventDefault();
        if (this._isRecordingLocked) return;
        if (this._isRecording) this._stopRecording(false);
      }
      : undefined;

    const iconTransition = (active: boolean, reverse = false) =>
      `position:absolute;inset:0;display:flex;align-items:center;justify-content:center;transition:transform 0.2s ease,opacity 0.2s ease;transform:${
        active
          ? "scale(1) rotate(0deg)"
          : `scale(0) rotate(${reverse ? "-" : ""}90deg)`
      };opacity:${active ? 1 : 0}`;

    const remaining = maxTextLength - estimateSerializedLength(this._input);

    return html`
      <style>
      ${kebabHoverCss}${indeterminateKeyframes}${pulseKeyframes}
      </style>
      <div
        data-testid="chat-container"
        style="${chatContainerStyle(isDark, customColors)}"
      >
        ${!customColors?.hideTitle
          ? html`
            <div data-testid="title-bar" style="${titleStyle(
              isDark,
              customColors,
            )}">
              <div style="${contentMaxWidthStyle(customColors)
                ? contentMaxWidthStyle(customColors) + ";"
                : ""}display:flex;align-items:center;padding:0 16px">
                <div data-testid="title-text" style="flex:1;text-align:center">
                  ${this.title}
                </div>
                ${this.enableVoiceCall && this.voiceCallState === "idle"
                  ? html`
                    <button
                      type="button"
                      data-testid="voice-call-button"
                      @click="${this.onStartCall}"
                      title="Start voice call"
                      style="${headerButtonStyle}"
                      @mouseover="${this._hoverBtnIn}"
                      @mouseout="${this._hoverBtnOut}"
                    >
                      ${faPhoneAlt}
                    </button>
                  `
                  : nothing} ${this.onClose
                  ? html`
                    <button
                      type="button"
                      data-testid="close-chat"
                      @click="${this.onClose}"
                      title="Close chat"
                      style="${headerButtonStyle};font-size:22px;font-weight:700"
                      @mouseover="${this._hoverBtnIn}"
                      @mouseout="${this._hoverBtnOut}"
                    >
                      &times;
                    </button>
                  `
                  : nothing}
              </div>
            </div>
          `
          : nothing} ${this.voiceCallState !== "idle"
          ? html`
            <div
              style="background:${isDark
                ? "#2a2a2a"
                : "#e2e8f0"};padding:12px 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid ${isDark
                ? "#1a1a1a"
                : "#cbd5e1"}"
            >
              <div style="color:${isDark
                ? "#fff"
                : "#000"};font-weight:bold">${voiceCallLabel(
                  this.voiceCallState,
                  this.voiceCallDuration,
                )}</div>
              <div style="display:flex;gap:8px">
                ${this.voiceCallState === "active" && this.onToggleMute
                  ? html`
                    <button
                      type="button"
                      @click="${this.onToggleMute}"
                      style="background:${this.voiceCallMuted
                        ? "#ef4444"
                        : isDark
                        ? "#4b5563"
                        : "#cbd5e1"};color:${this.voiceCallMuted
                        ? "#fff"
                        : isDark
                        ? "#fff"
                        : "#000"};border:none;padding:6px 12px;border-radius:16px;cursor:pointer;display:flex;align-items:center;gap:6px"
                    >
                      ${this.voiceCallMuted
                        ? faMicrophoneSlash
                        : faMicrophone} ${this.voiceCallMuted
                        ? "Unmute"
                        : "Mute"}
                    </button>
                  `
                  : nothing} ${this.voiceCallState === "ringing" &&
                    this.onAcceptCall
                  ? html`
                    <button
                      type="button"
                      @click="${this.onAcceptCall}"
                      style="background:#22c55e;color:#fff;border:none;padding:6px 12px;border-radius:16px;cursor:pointer"
                    >
                      Accept
                    </button>
                  `
                  : nothing} ${(this.voiceCallState === "ringing" ||
                      this.voiceCallState === "active" ||
                      this.voiceCallState === "calling" ||
                      this.voiceCallState === "connecting") &&
                    this.onEndCall && this.onRejectCall
                  ? html`
                    <button
                      type="button"
                      @click="${this.voiceCallState === "ringing"
                        ? this.onRejectCall
                        : this.onEndCall}"
                      style="background:#ef4444;color:#fff;border:none;padding:6px 12px;border-radius:16px;cursor:pointer"
                    >
                      ${this.voiceCallState === "ringing"
                        ? "Reject"
                        : "End Call"}
                    </button>
                  `
                  : nothing}
              </div>
            </div>
          `
          : nothing}

        <audio data-remote-audio autoplay style="display:none"></audio>

        <div
          data-testid="message-list"
          data-scrollable
          style="${messageContainerStyle(isDark, customColors)}"
        >
          <div
            data-content-inner
            style="display:flex;flex-direction:column;gap:8px;padding:4px 4px 72px 4px;flex-grow:1;box-sizing:border-box;min-width:0;${contentMaxWidthStyle(
              customColors,
            )}"
          >
            ${this.isLoading
              ? html`
                <div style="${centerFillStyle(isDark)}">${spinnerEl(
                  isDark,
                  customColors?.text,
                )}</div>
              `
              : allMsgs.length === 0 && this.activeSpinners.length === 0 &&
                  this.activeProgress.length === 0 &&
                  this.activeStreams.length === 0
              ? html`
                <div style="${centerFillStyle(isDark)}">
                  ${this.emptyMessage
                    ? html`
                      <span data-testid="empty-state">${this
                        .emptyMessage}</span>
                    `
                    : html`
                      <span data-testid="empty-state">No messages yet. Start the conversation!</span>
                    `}
                </div>
              `
              : html`
                ${timeline.map((entry) =>
                  this._renderTimelineEntry(entry)
                )} ${this._isSending
                  ? sendingAudioIndicator(
                    customColors?.primary ?? defaultPrimary(isDark),
                  )
                  : nothing} ${!empty(this.typingUsers)
                  ? html`
                    <chat-typing-indicator
                      .names="${this.typingUsers}"
                      .isDark="${isDark}"
                    ></chat-typing-indicator>
                  `
                  : nothing}
              `}
          </div>
        </div>

        <div style="position:absolute;bottom:0;left:0;right:0;z-index:10">
          ${!empty(this._pendingFiles)
            ? html`
              <div style="background:${customColors?.inputBackground ??
                (isDark ? "#1a1a1a" : "#ffffff")}">
                <div style="display:flex;gap:8px;padding:8px 12px;flex-wrap:wrap;${contentMaxWidthStyle(
                  customColors,
                )}">
                  ${this._pendingFiles.map(
                    (f, i) =>
                      html`
                        <div
                          style="display:flex;align-items:center;gap:4px;padding:4px 8px;background:${isDark
                            ? "#2a2a2a"
                            : "#cbd5e1"};border-radius:4px;font-size:12px"
                        >
                          <span>${f.name}</span>
                          <button
                            type="button"
                            @click="${() => {
                              this._pendingFiles = this._pendingFiles.filter(
                                (_, j) => j !== i,
                              );
                            }}"
                            style="background:none;border:none;cursor:pointer;color:${isDark
                              ? "#9ca3af"
                              : "#64748b"};padding:2px"
                          >
                            &times;
                          </button>
                        </div>
                      `,
                  )}
                </div>
              </div>
            `
            : nothing} ${this._isRecording
            ? html`
              <div style="${recordingIndicatorStyle(isDark)}">
                <div style="display:flex;align-items:center;gap:8px">
                  <span
                    style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#ef4444;animation:pulse 1s infinite"
                  ></span>
                  <span>Recording... ${formatDuration(
                    this._recordingDuration,
                  )}</span>
                </div>
                ${this._isMobile && !this._isRecordingLocked
                  ? html`
                    <div style="display:flex;align-items:center;gap:16px;font-size:12px">
                      <span
                        style="opacity:${0.6 +
                          Math.min(
                            0.4,
                            Math.abs(this._swipeOffset.x) / 50,
                          )};transform:translateX(${Math.min(
                            0,
                            this._swipeOffset.x / 3,
                          )}px);transition:opacity 0.15s"
                      >← slide to cancel</span>
                      <span
                        style="opacity:${0.4 +
                          Math.min(
                            0.6,
                            Math.abs(this._swipeOffset.y) / 30,
                          )};transform:translateY(${Math.min(
                            0,
                            this._swipeOffset.y / 3,
                          )}px);transition:opacity 0.15s"
                      >↑ lock</span>
                    </div>
                  `
                  : nothing} ${this._isMobile && this._isRecordingLocked
                  ? html`
                    <div style="display:flex;gap:8px">
                      <button
                        type="button"
                        @click="${() => this._stopRecording(false)}"
                        style="background:rgba(255,255,255,0.2);border:none;border-radius:4px;padding:6px 14px;color:#fff;font-size:14px;font-weight:500"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        @click="${() => this._stopRecording(true)}"
                        style="background:rgba(255,255,255,0.3);border:none;border-radius:4px;padding:6px 14px;color:#fff;font-size:14px;font-weight:500"
                      >
                        Send
                      </button>
                    </div>
                  `
                  : nothing} ${!this._isMobile
                  ? html`
                    <button
                      type="button"
                      @click="${() => this._stopRecording(false)}"
                      style="background:rgba(255,255,255,0.2);border:none;border-radius:4px;padding:4px 12px;color:#fff;cursor:pointer;font-size:13px"
                    >
                      Cancel
                    </button>
                  `
                  : nothing}
              </div>
            `
            : nothing}

          <div>
            <div style="display:flex;align-items:flex-end;gap:8px;${customColors
                ?.inputMaxWidth
              ? `max-width:${customColors.inputMaxWidth};margin:0 auto;width:100%`
              : contentMaxWidthStyle(customColors)}">
              <input
                data-file-input
                type="file"
                multiple
                style="display:none"
                @change="${this._onFileChange}"
              />
              <input
                data-camera-input
                type="file"
                accept="image/*"
                capture="environment"
                style="display:none"
                @change="${this._onFileChange}"
              />
              <input
                data-image-input
                type="file"
                accept="image/*, video/*"
                multiple
                style="display:none"
                @change="${this._onFileChange}"
              />
              <div
                style="position:relative;flex-grow:1;display:flex;align-items:flex-end"
              >
                ${this.enableAttachments
                  ? html`
                    <div
                      data-attach-wrapper
                      style="position:absolute;right:8px;top:50%;transform:translateY(-50%);z-index:100"
                    >
                      <button
                        data-testid="attach-button"
                        type="button"
                        @click="${this._toggleAttachMenu}"
                        style="background:none;border:none;cursor:pointer;color:${isDark
                          ? "#6b7280"
                          : "#94a3b8"};padding:4px;display:flex;align-items:center;justify-content:center"
                        title="Attach"
                      >
                        ${faPaperclip}
                      </button>
                      ${this._showAttachMenu
                        ? html`
                          <div data-testid="attach-menu" style="${attachMenuStyle(
                            isDark,
                          )}">
                            <button
                              type="button"
                              @click="${this._onAttachCamera}"
                              style="${attachMenuItemStyle(isDark)}"
                              @mouseenter="${this._hoverAttachIn}"
                              @mouseleave="${this._hoverAttachOut}"
                            >
                              ${faCamera} Camera
                            </button>
                            <button
                              type="button"
                              @click="${this._onAttachImage}"
                              style="${attachMenuItemStyle(isDark)}"
                              @mouseenter="${this._hoverAttachIn}"
                              @mouseleave="${this._hoverAttachOut}"
                            >
                              ${faImage} Photo & Video
                            </button>
                            <button
                              type="button"
                              @click="${this._onAttachDocument}"
                              style="${attachMenuItemStyle(isDark)}"
                              @mouseenter="${this._hoverAttachIn}"
                              @mouseleave="${this._hoverAttachOut}"
                            >
                              ${faFile} Document
                            </button>
                            ${this.onSendLocation
                              ? html`
                                <button
                                  type="button"
                                  @click="${this._onAttachLocation}"
                                  style="${attachMenuItemStyle(isDark)}"
                                  @mouseenter="${this._hoverAttachIn}"
                                  @mouseleave="${this._hoverAttachOut}"
                                >
                                  ${faMapMarkerAlt} Location
                                </button>
                              `
                              : nothing}
                          </div>
                        `
                        : nothing}
                    </div>
                  `
                  : nothing}
                <textarea
                  data-testid="message-input"
                  dir="auto"
                  rows="1"
                  placeholder="Type a message..."
                  .value="${this._input}"
                  @input="${this._onTextareaInput}"
                  @paste="${this._onTextareaPaste}"
                  @blur="${() => this.onInputActivity?.()}"
                  @keydown="${this._onTextareaKeydown}"
                  style="${textareaStyle(
                    isDark,
                    customColors,
                    this.enableAttachments,
                    this._textareaHeight,
                    this._textareaOverflow,
                  )}"
                ></textarea>
              </div>
              <button
                data-testid="send-button"
                type="button"
                @mousedown="${(e: Event) => e.preventDefault()}"
                @click="${this._isMobile ? undefined : handleButtonClick}"
                @touchstart="${handleTouchStart}"
                @touchmove="${handleTouchMove}"
                @touchend="${handleTouchEnd}"
                @touchcancel="${handleTouchCancel}"
                style="${sendButtonStyle(
                  isDark,
                  customColors,
                )};background:${showStop
                  ? "#dc2626"
                  : inputBgColor};color:${showStop
                  ? "#fff"
                  : (isDark
                    ? "#fff"
                    : "#222")};touch-action:none;position:relative;overflow:hidden"
                title="${showMic
                  ? (this._isMobile ? "Hold to record" : "Record audio")
                  : showStop
                  ? "Stop recording"
                  : "Send"}"
              >
                <span style="${iconTransition(
                  showMic,
                  true,
                )}">${faMicrophone}</span>
                <span style="${iconTransition(showStop)}">${faStop}</span>
                <span style="${iconTransition(
                  showSendBtn,
                )}">${faPaperPlane}</span>
              </button>
            </div>
            ${remaining < charCountThreshold
              ? html`
                <div style="${charCountStyle(isDark, remaining < 0)}">
                  ${remaining < 0
                    ? `${-remaining} characters over limit`
                    : `${remaining} characters remaining`}
                </div>
              `
              : nothing}
          </div>
        </div>
        ${this._fetchingMore
          ? html`
            <div style="${loadingStyle}">Loading more...</div>
          `
          : nothing}
      </div>
    `;
  }

  private _renderTimelineEntry(entry: TimelineEntry) {
    const { isDark, customColors } = this;
    if (entry.kind === "message") {
      return html`
        <chat-message
          .msg="${entry.msg}"
          .prev="${entry.prevMsg}"
          .isOwn="${entry.msg.authorId === this.userId}"
          .onDecryptAttachment="${this.onDecryptAttachment}"
          .sessionStart="${this._sessionStart}"
          .onEdit="${this.onEdit
            ? (newText: string) => this.onEdit!(entry.msg.id, newText)
            : undefined}"
          .customColors="${customColors}"
          .isDark="${isDark}"
        ></chat-message>
      `;
    }
    if (entry.kind === "stream") {
      const streamMsg: AbstracChatMessage = {
        id: entry.stream.elementId,
        authorId: entry.stream.authorPublicKey ?? entry.stream.authorName,
        authorName: entry.stream.authorName,
        authorAvatar: entry.stream.authorAvatar,
        text: entry.stream.text,
        timestamp: entry.stream.timestamp,
      };
      return html`
        <chat-message
          .msg="${streamMsg}"
          .prev="${entry.prevMsg}"
          .isOwn="${false}"
          .onDecryptAttachment="${this.onDecryptAttachment}"
          .sessionStart="${this._sessionStart}"
          .customColors="${customColors}"
          .isDark="${isDark}"
        ></chat-message>
      `;
    }
    if (entry.kind === "spinner") {
      return renderSpinnerIndicator(
        entry.spinner,
        isDark,
        customColors?.hideNames,
        this.isGroupChat,
        customColors?.text,
      );
    }
    return renderProgressIndicator(
      entry.progress,
      isDark,
      customColors?.hideNames,
      this.isGroupChat,
      customColors?.text,
    );
  }
}

customElements.define("chat-box", ChatBox);
