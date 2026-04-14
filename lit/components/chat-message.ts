import "emoji-picker-element";
import { html, LitElement, nothing } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import type { Attachment } from "../../protocol/src/clientApi.ts";
import {
  avatarColor,
  defaultOtherBubble,
  defaultPrimary,
  isLightColor,
} from "./design.ts";
import "./chat-attachment.ts";
import "./chat-avatar.ts";
import {
  faCopy,
  faEllipsisV,
  faHistory,
  faPen,
  faPhoneAlt,
  faReply,
  faSmile,
} from "./icons.ts";
import {
  fencedCodeHoverCss,
  highlightCss,
  renderMarkdown,
} from "./markdown.ts";
import type {
  AbstracChatMessage,
  CustomColors,
  DiffPart,
  EditHistoryEntry,
  Reaction,
  ReplyQuote,
} from "./types.ts";
import {
  computeTimeAgo,
  copyToClipboard,
  editWindowMs,
  formatEditTime,
  successorText,
  wordDiff,
} from "./utils.ts";
import { empty } from "@uri/gamla";

const kebabHoverCss =
  `.msg-bubble .msg-kebab{opacity:0;transition:opacity .15s}.msg-bubble:hover .msg-kebab,.msg-kebab[data-open]{opacity:.7}`;

const kebabMenuStyle = (textColor: string) =>
  `background:transparent;border:none;cursor:pointer;padding:2px 4px;color:${textColor};border-radius:4px;display:flex;align-items:center`;

const dropdownMenuStyle = (isDark: boolean, rect: DOMRect) =>
  `position:fixed;top:${rect.bottom + 2}px;right:${
    globalThis.innerWidth - rect.right
  }px;background:${isDark ? "#141414" : "#fff"};border-radius:8px;box-shadow:${
    isDark ? "0 4px 12px #0008" : "0 4px 12px #0003"
  };z-index:10000;min-width:120px;overflow:hidden`;

const dropdownItemStyle = (isDark: boolean) =>
  `display:flex;align-items:center;gap:8px;width:100%;padding:8px 12px;background:transparent;border:none;cursor:pointer;font-size:13px;color:${
    isDark ? "#e5e7eb" : "#1a1a1a"
  };white-space:nowrap`;

const overlayStyle =
  "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000";

const historyPopupStyle = (isDark: boolean) =>
  `background:${
    isDark ? "#1a1a1a" : "#fff"
  };border-radius:12px;padding:16px;max-width:400px;max-height:80vh;overflow:auto;border:1px solid ${
    isDark ? "#2a2a2a" : "#e5e7eb"
  };color:${isDark ? "#eee" : "#222"}`;

const historyEntryStyle = (isDark: boolean) =>
  `margin-bottom:8px;padding:8px;background:${
    isDark ? "#1a1a1a" : "#f9fafb"
  };border-radius:8px;opacity:0.8`;

const historyCurrentStyle = (isDark: boolean) =>
  `margin-bottom:12px;padding:8px;background:${
    isDark ? "#2a2a2a" : "#f3f4f6"
  };border-radius:8px`;

const historyCloseButtonStyle = (isDark: boolean) =>
  `margin-top:8px;padding:6px 12px;background:${
    isDark ? "#2a2a2a" : "#e5e7eb"
  };border:none;border-radius:6px;cursor:pointer;color:${
    isDark ? "#eee" : "#222"
  }`;

const editTextareaStyle =
  "width:100%;padding:6px;border-radius:8px;border:none;font-size:14px;resize:vertical;min-height:40px";

const saveButtonStyle = (isDark: boolean) =>
  `padding:4px 8px;border-radius:6px;border:none;background:${
    isDark ? "#2a2a2a" : "#e5e7eb"
  };cursor:pointer;font-size:12px`;

const cancelButtonStyle =
  "padding:4px 8px;border-radius:6px;border:none;background:transparent;cursor:pointer;font-size:12px;opacity:0.7";

const quickEmojis = ["👍", "❤️", "😂", "😮", "🙏"];

const longPressHighlightCss =
  `@keyframes msg-highlight{0%{transform:scale(1);box-shadow:none}100%{transform:scale(1.02);box-shadow:0 0 16px rgba(100,100,255,0.25)}}`;

const liveCursorCss =
  `@keyframes msg-live-cursor{0%,100%{opacity:.35;transform:scaleY(.9)}50%{opacity:1;transform:scaleY(1)}}`;

const streamTickMs = 20;

const nextVisibleText = (target: string, visible: string) => {
  if (visible === target) return visible;
  if (!target.startsWith(visible)) return target;
  return target.slice(0, visible.length + 1);
};

const liveCursorHtml = (isDark: boolean) =>
  `<span aria-hidden="true" style="display:inline-block;width:2px;height:1.05em;margin-inline-start:2px;border-radius:999px;vertical-align:-0.12em;background:${
    isDark ? "#ffffffcc" : "#111111aa"
  };animation:msg-live-cursor .9s ease-in-out infinite"></span>`;

const injectCursorAtEnd = (html: string, cursor: string) => {
  const i = html.lastIndexOf("</div>");
  return i === -1 ? html + cursor : html.slice(0, i) + cursor + html.slice(i);
};

const mobileContextOverlayStyle =
  "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.4);z-index:999";

const mobileContextMenuStyle = (
  isDark: boolean,
  touchY: number,
  touchX: number,
) => {
  const menuWidth = 250;
  const menuHeight = 220;
  const vp = globalThis.innerHeight;
  const vpW = globalThis.innerWidth;
  const top = touchY - menuHeight - 12 < 0
    ? Math.min(touchY + 12, vp - menuHeight - 12)
    : touchY - menuHeight - 12;
  const left = Math.max(
    12,
    Math.min(touchX - menuWidth / 2, vpW - menuWidth - 12),
  );
  return `position:fixed;top:${top}px;left:${left}px;background:${
    isDark ? "#1a1a1a" : "#fff"
  };border-radius:16px;padding:8px 0;min-width:220px;max-width:280px;box-shadow:${
    isDark ? "0 8px 32px #000a" : "0 8px 32px #0003"
  };overflow:hidden`;
};

const mobileContextEmojiRowStyle = (isDark: boolean) =>
  `display:flex;justify-content:center;gap:4px;padding:8px 12px;border-bottom:1px solid ${
    isDark ? "#2a2a2a" : "#e5e7eb"
  }`;

const mobileContextActionStyle = (isDark: boolean) =>
  `display:flex;align-items:center;gap:10px;width:100%;padding:12px 16px;background:transparent;border:none;cursor:pointer;font-size:15px;color:${
    isDark ? "#e5e7eb" : "#1a1a1a"
  }`;

const smileyTriggerCss =
  `.msg-wrap .msg-smiley-trigger{opacity:0;transition:opacity .15s}.msg-wrap:hover .msg-smiley-trigger{opacity:1}`;

const smileyTriggerStyle = (isDark: boolean, isOwn: boolean) =>
  `position:absolute;${
    isOwn ? "left:-36px" : "right:-36px"
  };top:calc(50% - 18px);transform:translateY(-50%);background:${
    isDark ? "#1a1a1a" : "#fff"
  };border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;cursor:pointer;border:none;box-shadow:${
    isDark ? "0 1px 4px #0006" : "0 1px 4px #0002"
  };color:${isDark ? "#aaa" : "#666"};font-size:17px;padding:0`;

const quickEmojiRowStyle = (isDark: boolean, isOwn: boolean) =>
  `position:absolute;top:50%;transform:translateY(calc(-100% - 24px));${
    isOwn ? "left:-36px" : "right:-36px"
  };display:flex;gap:2px;background:${
    isDark ? "#1a1a1a" : "#fff"
  };border-radius:20px;padding:4px 6px;box-shadow:${
    isDark ? "0 2px 12px #0008" : "0 2px 12px #0003"
  };z-index:100`;

const reactionBtnStyle =
  "background:transparent;border:none;cursor:pointer;font-size:16px;padding:2px 3px;line-height:1;border-radius:4px";

const reactionPillStyle = (isDark: boolean, isActive: boolean) =>
  `display:inline-flex;align-items:center;gap:3px;padding:2px 6px;border-radius:10px;font-size:12px;cursor:pointer;border:1px solid ${
    isActive ? (isDark ? "#555" : "#bbb") : (isDark ? "#333" : "#e5e7eb")
  };background:${
    isActive
      ? (isDark ? "#2a2a2a" : "#e8e8ff")
      : (isDark ? "#141414" : "#f9fafb")
  };color:${isDark ? "#e5e7eb" : "#222"}`;

const diffPartStyle = (kind: DiffPart["kind"], isDark: boolean) =>
  kind === "add"
    ? `background:${isDark ? "#16532e" : "#d4edda"};color:${
      isDark ? "#6ee7b7" : "#155724"
    }`
    : kind === "del"
    ? `background:${isDark ? "#5c1d1d" : "#f8d7da"};color:${
      isDark ? "#fca5a5" : "#721c24"
    };text-decoration:line-through`
    : "";

const renderDiff = (parts: DiffPart[], isDark: boolean) =>
  parts.map(
    (p) =>
      html`
        <span style="${diffPartStyle(p.kind, isDark)}">${p.text}</span>
      `,
  );

const renderEditHistory = (
  edits: EditHistoryEntry[],
  currentText: string,
  isDark: boolean,
  onClose: () => void,
) =>
  html`
    <div style="${overlayStyle}" @click="${onClose}">
      <div style="${historyPopupStyle(isDark)}" @click="${(e: Event) =>
        e.stopPropagation()}">
        <div style="font-weight:bold;margin-bottom:12px">Edit History</div>
        <div style="${historyCurrentStyle(isDark)}">
          <div style="font-size:10px;opacity:0.7">Current</div>
          <div>${currentText}</div>
        </div>
        ${edits.map(
          (edit, i) =>
            html`
              <div style="${historyEntryStyle(isDark)}">
                <div style="font-size:10px;opacity:0.7">${formatEditTime(
                  edit.timestamp,
                )}</div>
                <div>${renderDiff(
                  wordDiff(edit.text, successorText(edits, currentText, i)),
                  isDark,
                )}</div>
              </div>
            `,
        )}
        <button type="button" @click="${onClose}" style="${historyCloseButtonStyle(
          isDark,
        )}">
          Close
        </button>
      </div>
    </div>
  `;

const replyTriggerStyle = (isDark: boolean, isOwn: boolean) =>
  `position:absolute;${
    isOwn ? "left:-36px" : "right:-36px"
  };top:calc(50% + 20px);transform:translateY(-50%);background:${
    isDark ? "#1a1a1a" : "#fff"
  };border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;cursor:pointer;border:none;box-shadow:${
    isDark ? "0 1px 4px #0006" : "0 1px 4px #0002"
  };color:${isDark ? "#aaa" : "#666"};font-size:13px;padding:0`;

const quoteBarColor = (isDark: boolean, isOwn: boolean) =>
  isOwn ? (isDark ? "#818cf8" : "#6366f1") : (isDark ? "#6366f1" : "#4f46e5");

const renderQuotedMessage = (
  reply: ReplyQuote,
  isDark: boolean,
  isOwn: boolean,
  bubbleTextColor: string,
) =>
  html`
    <div
      style="margin-bottom:4px;padding:6px 8px;border-radius:6px;border-left:3px solid ${quoteBarColor(
        isDark,
        isOwn,
      )};background:${isDark
        ? "rgba(255,255,255,0.06)"
        : "rgba(0,0,0,0.05)"};cursor:pointer"
    >
      <div
        style="font-size:11px;font-weight:600;color:${quoteBarColor(
          isDark,
          isOwn,
        )};white-space:nowrap;overflow:hidden;text-overflow:ellipsis"
      >
        ${reply.authorName}
      </div>
      <div
        style="font-size:12px;color:${bubbleTextColor};opacity:0.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:250px"
      >
        ${reply.text || "Attachment"}
      </div>
    </div>
  `;

type GroupedReaction = { emoji: string; count: number; hasOwn: boolean };

const groupReactions =
  (userId: string) => (reactions: Reaction[]): GroupedReaction[] => {
    const map = new Map<string, { count: number; hasOwn: boolean }>();
    reactions.forEach((r) => {
      const entry = map.get(r.emoji) ?? { count: 0, hasOwn: false };
      entry.count++;
      if (r.authorId === userId) entry.hasOwn = true;
      map.set(r.emoji, entry);
    });
    return Array.from(map.entries()).map(([emoji, { count, hasOwn }]) => ({
      emoji,
      count,
      hasOwn,
    }));
  };

const renderReactionPills = (
  groups: GroupedReaction[],
  isDark: boolean,
  onToggle: (emoji: string) => void,
) =>
  html`
    <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">
      ${groups.map(
        ({ emoji, count, hasOwn }) =>
          html`
            <button
              type="button"
              @click="${() => onToggle(emoji)}"
              style="${reactionPillStyle(isDark, hasOwn)}"
              title="${hasOwn ? "Remove reaction" : "React"}"
            >
              <span>${emoji}</span>
              <span style="font-size:11px">${count}</span>
            </button>
          `,
      )}
    </div>
  `;

const renderEmojiGrid = (
  isDark: boolean,
  onPick: (emoji: string) => void,
  onClose: () => void,
) =>
  html`
    <div style="${overlayStyle}" @click="${onClose}">
      <div
        style="background:${isDark
          ? "#1a1a1a"
          : "#fff"};border-radius:12px;overflow:hidden;border:1px solid ${isDark
          ? "#2a2a2a"
          : "#e5e7eb"};box-shadow:${isDark
          ? "0 4px 16px #0008"
          : "0 4px 16px #0003"};display:flex;align-items:center;justify-content:center"
        @click="${(e: Event) => e.stopPropagation()}"
      >
        <emoji-picker
          class="${isDark ? "dark" : "light"}"
          style="width:100%;height:350px;max-height:60vh;max-width:350px;--background:transparent"
          @emoji-click="${(e: CustomEvent) => {
            onPick(e.detail.unicode);
            onClose();
          }}"
        ></emoji-picker>
      </div>
    </div>
  `;

export class ChatMessage extends LitElement {
  static override properties = {
    msg: { attribute: false },
    prev: { attribute: false },
    isOwn: { type: Boolean },
    onDecryptAttachment: { attribute: false },
    sessionStart: { type: Number },
    onEdit: { attribute: false },
    onReact: { attribute: false },
    onReply: { attribute: false },
    userId: { attribute: false },
    onAvatarClick: { attribute: false },
    customColors: { attribute: false },
    isDark: { type: Boolean },
    isMobile: { type: Boolean },
    streamActive: { type: Boolean },
    _isEditing: { state: true },
    _editText: { state: true },
    _showHistory: { state: true },
    _menuOpen: { state: true },
    _timeAgo: { state: true },
    _showEmojiPicker: { state: true },
    _showQuickEmojis: { state: true },
    _showMobileContext: { state: true },
    _longPressActive: { state: true },
    _touchY: { state: true },
    _touchX: { state: true },
  };

  declare msg: AbstracChatMessage;
  declare prev: AbstracChatMessage | undefined;
  declare isOwn: boolean;
  declare onDecryptAttachment: ((url: string) => Promise<string>) | undefined;
  declare sessionStart: number;
  declare onEdit: ((newText: string) => void) | undefined;
  declare onReact: ((emoji: string, remove?: boolean) => void) | undefined;
  declare onReply: (() => void) | undefined;
  declare userId: string;
  declare onAvatarClick: ((authorId: string) => void) | undefined;
  declare customColors: CustomColors | undefined;
  declare isDark: boolean;
  declare isMobile: boolean;
  declare streamActive: boolean;

  declare private _isEditing: boolean;
  declare private _editText: string;
  declare private _showHistory: boolean;
  declare private _menuOpen: boolean;
  declare private _timeAgo: string;
  declare private _showEmojiPicker: boolean;
  declare private _showQuickEmojis: boolean;
  declare private _showMobileContext: boolean;
  declare private _longPressActive: boolean;
  declare private _touchY: number;
  declare private _touchX: number;
  declare private _visibleText: string;
  private _streamTimer = 0;
  private _timeInterval = 0;
  private _btnEl: HTMLButtonElement | null = null;
  private _menuEl: HTMLDivElement | null = null;
  private _outsideClickHandler: ((e: MouseEvent) => void) | null = null;
  private _longPressTimer = 0;

  constructor() {
    super();
    this.isOwn = false;
    this.sessionStart = 0;
    this.isDark = false;
    this.isMobile = false;
    this.streamActive = false;
    this.userId = "";
    this._isEditing = false;
    this._editText = "";
    this._showHistory = false;
    this._menuOpen = false;
    this._timeAgo = "";
    this._showEmojiPicker = false;
    this._showQuickEmojis = false;
    this._showMobileContext = false;
    this._longPressActive = false;
    this._touchY = 0;
    this._touchX = 0;
    this._visibleText = "";
  }

  override createRenderRoot() {
    return this;
  }

  override connectedCallback() {
    super.connectedCallback();
    this._updateTimeAgo();
    this._timeInterval = globalThis.setInterval(
      () => this._updateTimeAgo(),
      30000,
    );
    this.addEventListener("click", this._handleCopyCode);
    this._syncVisibleText();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    clearInterval(this._timeInterval);
    clearTimeout(this._streamTimer);
    clearTimeout(this._longPressTimer);
    document.removeEventListener("mousedown", this._dismissQuickEmojis);
    this._removeOutsideClick();
    this.removeEventListener("click", this._handleCopyCode);
  }

  private _handleCopyCode = (e: Event) => {
    const btn = (e.target as HTMLElement).closest?.(
      '[data-testid="copy-code-button"]',
    );
    if (!btn) return;
    const codeEl = btn.parentElement?.querySelector("code");
    if (codeEl) copyToClipboard(codeEl.textContent ?? "");
  };

  private _updateTimeAgo() {
    this._timeAgo = computeTimeAgo(this.msg.timestamp);
  }

  private _scheduleStreamTick = () => {
    clearTimeout(this._streamTimer);
    const target = this.msg.text;
    if (this._visibleText === target) return;
    this._streamTimer = globalThis.setTimeout(() => {
      const next = nextVisibleText(target, this._visibleText);
      if (next !== this._visibleText) {
        this._visibleText = next;
      }
      this._scheduleStreamTick();
    }, streamTickMs);
  };

  private _syncVisibleText = () => {
    if (!this.streamActive) {
      this._visibleText = this.msg.text;
      clearTimeout(this._streamTimer);
      return;
    }
    if (!this.msg.text.startsWith(this._visibleText)) {
      this._visibleText = "";
    }
    this._scheduleStreamTick();
  };

  override willUpdate(changed: Map<PropertyKey, unknown>) {
    if (changed.has("msg") || changed.has("streamActive")) {
      this._syncVisibleText();
    }
  }

  private _removeOutsideClick() {
    if (this._outsideClickHandler) {
      document.removeEventListener("mousedown", this._outsideClickHandler);
      this._outsideClickHandler = null;
    }
  }

  private _toggleMenu = () => {
    this._menuOpen = !this._menuOpen;
    if (this._menuOpen) {
      this._outsideClickHandler = (e: MouseEvent) => {
        if (
          this._menuEl && !this._menuEl.contains(e.target as Node) &&
          this._btnEl && !this._btnEl.contains(e.target as Node)
        ) {
          this._menuOpen = false;
          this._removeOutsideClick();
        }
      };
      document.addEventListener("mousedown", this._outsideClickHandler);
    } else {
      this._removeOutsideClick();
    }
  };

  private _startEdit = () => {
    this._menuOpen = false;
    this._removeOutsideClick();
    this._editText = this.msg.text;
    this._isEditing = true;
  };

  private _cancelEdit = () => {
    this._isEditing = false;
    this._editText = this.msg.text;
  };

  private _submitEdit = () => {
    if (
      this._editText.trim() && this._editText !== this.msg.text && this.onEdit
    ) {
      this.onEdit(this._editText);
    }
    this._isEditing = false;
  };

  private _hoverIn = (e: Event) => {
    (e.currentTarget as HTMLElement).style.background = this.isDark
      ? "#2a2a2a"
      : "#f3f4f6";
  };

  private _hoverOut = (e: Event) => {
    (e.currentTarget as HTMLElement).style.background = "transparent";
  };

  private _toggleReaction = (emoji: string) => {
    if (!this.onReact) return;
    const hasOwn = (this.msg.reactions ?? []).some(
      (r) => r.emoji === emoji && r.authorId === this.userId,
    );
    this.onReact(emoji, hasOwn || undefined);
    this._showQuickEmojis = false;
  };

  private _longPressStart = (e: TouchEvent) => {
    if (!this.isMobile) return;
    // Removed e.preventDefault() so that normal browser scrolling isn't blocked.
    this._longPressActive = true;
    this._touchY = e.touches[0]?.clientY ?? 0;
    this._touchX = e.touches[0]?.clientX ?? 0;
    this._longPressTimer = globalThis.setTimeout(() => {
      this._longPressActive = false;
      this._showMobileContext = true;
    }, 500);
  };

  private _longPressEnd = () => {
    clearTimeout(this._longPressTimer);
    this._longPressActive = false;
  };

  private _dismissQuickEmojis = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest?.(".msg-quick-emojis")) {
      this._showQuickEmojis = false;
      document.removeEventListener("mousedown", this._dismissQuickEmojis);
    }
  };

  private _closeMobileContext = () => {
    this._showMobileContext = false;
  };

  private _copyText = () => {
    copyToClipboard(this.msg.text);
    this._showMobileContext = false;
  };

  override render() {
    const {
      authorId,
      authorName,
      authorAvatar,
      text,
      timestamp,
      attachments,
      editHistory,
      callDetails,
    } = this.msg;
    const { isDark, isOwn, customColors } = this;
    const isStartOfSequence = !this.prev ||
      this.prev.authorId !== authorId;
    const baseColor = isOwn
      ? (customColors?.primary ?? defaultPrimary(isDark))
      : (customColors?.otherBubble ?? defaultOtherBubble(isDark));
    const participantColor = avatarColor(authorId, isDark);
    const noBubble = !isOwn && customColors?.hideOtherBubble;
    const showAvatar = isStartOfSequence && !isOwn;
    const textColor = noBubble
      ? (customColors?.text ?? (isDark ? "#f4f4f4" : "#222"))
      : isLightColor(baseColor)
      ? "#222"
      : "#fff";
    const avatarSpace = isOwn ? 0 : 36;
    const canEdit = !!(isOwn && this.onEdit &&
      Date.now() - timestamp < editWindowMs);
    const hasEdits = !empty(editHistory ?? []);
    const showMenu = (canEdit || hasEdits) && !this._isEditing;
    const displayedText = this.streamActive ? this._visibleText : text;
    const markdownHtml = renderMarkdown(displayedText, textColor, isDark);
    const canSave = !!this._editText.trim() &&
      this._editText !== text;

    return html`
      <style>
      ${kebabHoverCss}${fencedCodeHoverCss}${smileyTriggerCss}${longPressHighlightCss}${liveCursorCss}${highlightCss}
      .msg-wrap .msg-reply-trigger{opacity:0;transition:opacity .15s}.msg-wrap:hover .msg-reply-trigger{opacity:1}
      </style>
      <div
        data-testid="message"
        style="display:flex;gap:6px;align-items:flex-start;flex-direction:${isOwn
          ? "row-reverse"
          : "row"};min-width:0"
      >
        ${showAvatar
          ? html`
            <chat-avatar
              .image="${authorAvatar ?? ""}"
              .name="${authorName}"
              .baseColor="${participantColor}"
              .isDark="${isDark}"
              style="cursor:pointer"
              @click="${() => this.onAvatarClick?.(authorId)}"
            ></chat-avatar>
          `
          : nothing}
        <div
          class="msg-wrap"
          style="display:flex;flex-direction:column;min-width:0;align-items:${isOwn
            ? "flex-end"
            : "flex-start"};position:relative;max-width:80%${this.isMobile
            ? ";user-select:none;-webkit-user-select:none;-webkit-touch-callout:none"
            : ""}"
          @contextmenu="${(e: Event) => {
            if (this.isMobile) e.preventDefault();
          }}"
          @touchstart="${this._longPressStart}"
          @touchend="${this._longPressEnd}"
          @touchmove="${this._longPressEnd}"
          @touchcancel="${this._longPressEnd}"
        >
          <div
            class="msg-bubble"
            style="min-width:0;max-width:100%;background:${noBubble
              ? "transparent"
              : baseColor};color:${textColor};align-self:${isOwn
              ? "flex-end"
              : "flex-start"};border-radius:${noBubble
              ? "0"
              : "16px"};padding:${noBubble
              ? "2px 0"
              : "6px 12px"};margin-left:${isOwn
              ? "0"
              : showAvatar
              ? "0"
              : avatarSpace + "px"};margin-right:${isOwn
              ? (showAvatar ? "0" : avatarSpace + "px")
              : "0"};overflow-x:hidden;overflow-y:hidden;word-break:break-word;overflow-wrap:anywhere${this
                ._longPressActive
              ? ";animation:msg-highlight .3s ease forwards"
              : ""}"
          >
            ${isStartOfSequence && !isOwn && !customColors?.hideNames
              ? html`
                <b data-testid="author-name" style="font-size:11px;color:${participantColor}"
                >${authorName}</b>
              `
              : nothing} ${this.msg.replyTo
              ? renderQuotedMessage(
                this.msg.replyTo,
                isDark,
                isOwn,
                textColor,
              )
              : nothing} ${this._isEditing
              ? html`
                <div style="margin-top:4px">
                  <textarea
                    .value="${this._editText}"
                    @input="${(e: InputEvent) => {
                      this._editText = (e.target as HTMLTextAreaElement).value;
                    }}"
                    @keydown="${(e: KeyboardEvent) => e.stopPropagation()}"
                    style="${editTextareaStyle}"
                  ></textarea>
                  <div style="display:flex;gap:4px;margin-top:4px">
                    <button
                      type="button"
                      @click="${this._submitEdit}"
                      ?disabled="${!canSave}"
                      style="${saveButtonStyle(isDark)}${canSave
                        ? ""
                        : ";opacity:0.4;cursor:default"}"
                    >
                      Save
                    </button>
                    <button type="button" @click="${this
                      ._cancelEdit}" style="${cancelButtonStyle}">
                      Cancel
                    </button>
                  </div>
                </div>
              `
              : displayedText || this.streamActive
              ? html`
                <div
                  data-testid="message-text"
                  dir="auto"
                  style="overflow-wrap:anywhere;word-break:break-word;min-width:0;${callDetails
                    ? "display:flex;align-items:center;gap:8px"
                    : ""}"
                >
                  ${callDetails ? faPhoneAlt : nothing} ${unsafeHTML(
                    this.streamActive && displayedText.trim()
                      ? injectCursorAtEnd(markdownHtml, liveCursorHtml(isDark))
                      : markdownHtml,
                  )}
                </div>
              `
              : nothing} ${attachments && attachments.length > 0
              ? html`
                <div style="display:flex;flex-direction:column;gap:6px;margin-top:6px">
                  ${attachments.map(
                    (att: Attachment) =>
                      html`
                        <chat-attachment
                          .attachment="${att}"
                          .isDark="${isDark}"
                          .textColor="${textColor}"
                          .primaryColor="${baseColor}"
                          .isOwn="${isOwn}"
                          .messageTimestamp="${timestamp}"
                          .sessionStart="${this.sessionStart}"
                          .onDecrypt="${this.onDecryptAttachment}"
                        ></chat-attachment>
                      `,
                  )}
                </div>
              `
              : nothing}
            <div
              style="display:flex;justify-content:flex-end;align-items:center;gap:4px"
            >
              ${showMenu
                ? html`
                  <div style="display:flex;align-items:center;gap:4px">
                    ${hasEdits
                      ? html`
                        <span style="font-size:10px;opacity:0.7">edited</span>
                      `
                      : nothing}
                    <button
                      type="button"
                      class="msg-kebab"
                      ?data-open="${this._menuOpen || undefined}"
                      @click="${this._toggleMenu}"
                      style="${kebabMenuStyle(textColor)}"
                      title="More options"
                    >
                      ${faEllipsisV}
                    </button>
                    ${this._menuOpen
                      ? html`
                        <div
                          style="${dropdownMenuStyle(
                            isDark,
                            this._btnEl?.getBoundingClientRect() ??
                              new DOMRect(),
                          )}"
                        >
                          ${canEdit
                            ? html`
                              <button
                                type="button"
                                @click="${this._startEdit}"
                                style="${dropdownItemStyle(isDark)}"
                                @mouseenter="${this._hoverIn}"
                                @mouseleave="${this._hoverOut}"
                              >
                                ${faPen} Edit
                              </button>
                            `
                            : nothing} ${hasEdits
                            ? html`
                              <button
                                type="button"
                                @click="${() => {
                                  this._menuOpen = false;
                                  this._removeOutsideClick();
                                  this._showHistory = true;
                                }}"
                                style="${dropdownItemStyle(isDark)}"
                                @mouseenter="${this._hoverIn}"
                                @mouseleave="${this._hoverOut}"
                              >
                                ${faHistory} View history
                              </button>
                            `
                            : nothing}
                        </div>
                      `
                      : nothing}
                  </div>
                `
                : html`
                  <div style="display:flex;align-items:center;gap:4px">
                    <button type="button" style="${kebabMenuStyle(
                      textColor,
                    )};visibility:hidden">
                      ${faEllipsisV}
                    </button>
                  </div>
                `}
              <span style="color:${textColor};opacity:0.7;font-size:10px"
              >${this._timeAgo}</span>
            </div>
          </div>
          ${this.onReact && !this.isMobile
            ? html`
              <button
                type="button"
                class="msg-smiley-trigger"
                style="${smileyTriggerStyle(isDark, isOwn)}"
                @click="${() => {
                  this._showQuickEmojis = !this._showQuickEmojis;
                  if (this._showQuickEmojis) {
                    requestAnimationFrame(() =>
                      document.addEventListener(
                        "mousedown",
                        this._dismissQuickEmojis,
                      )
                    );
                  }
                }}"
                title="React"
              >
                ${faSmile}
              </button>
            `
            : nothing} ${this.onReply && !this.isMobile
            ? html`
              <button
                type="button"
                class="msg-reply-trigger"
                style="${replyTriggerStyle(isDark, isOwn)}"
                @click="${() => this.onReply?.()}"
                title="Reply"
              >
                ${faReply}
              </button>
            `
            : nothing} ${this._showQuickEmojis && this.onReact
            ? html`
              <div class="msg-quick-emojis" style="${quickEmojiRowStyle(
                isDark,
                isOwn,
              )}">
                ${quickEmojis.map(
                  (emoji) =>
                    html`
                      <button
                        type="button"
                        @click="${() => this._toggleReaction(emoji)}"
                        style="${reactionBtnStyle}"
                      >
                        ${emoji}
                      </button>
                    `,
                )}
                <button
                  type="button"
                  @click="${() => {
                    this._showQuickEmojis = false;
                    this._showEmojiPicker = true;
                  }}"
                  style="${reactionBtnStyle};font-size:14px"
                  title="More reactions"
                >
                  +
                </button>
              </div>
            `
            : nothing} ${!empty(this.msg.reactions ?? [])
            ? renderReactionPills(
              groupReactions(this.userId)(this.msg.reactions!),
              isDark,
              (emoji: string) => this._toggleReaction(emoji),
            )
            : nothing}
        </div>
        ${this._showMobileContext
          ? html`
            <div style="${mobileContextOverlayStyle}" @click="${this
              ._closeMobileContext}">
              <div style="${mobileContextMenuStyle(
                isDark,
                this._touchY,
                this._touchX,
              )}" @click="${(
                e: Event,
              ) => e.stopPropagation()}">
                ${this.onReact
                  ? html`
                    <div style="${mobileContextEmojiRowStyle(isDark)}">
                      ${quickEmojis.map(
                        (emoji) =>
                          html`
                            <button
                              type="button"
                              @click="${() => {
                                this._toggleReaction(emoji);
                                this._showMobileContext = false;
                              }}"
                              style="${reactionBtnStyle};font-size:22px;padding:4px 6px"
                            >
                              ${emoji}
                            </button>
                          `,
                      )}
                      <button
                        type="button"
                        @click="${() => {
                          this._showMobileContext = false;
                          this._showEmojiPicker = true;
                        }}"
                        style="${reactionBtnStyle};font-size:16px;padding:4px 6px;color:${isDark
                          ? "#aaa"
                          : "#666"}"
                        title="More reactions"
                      >
                        +
                      </button>
                    </div>
                  `
                  : nothing} ${this.onReply
                  ? html`
                    <button
                      type="button"
                      @click="${() => {
                        this.onReply?.();
                        this._closeMobileContext();
                      }}"
                      style="${mobileContextActionStyle(isDark)}"
                    >
                      ${faReply} Reply
                    </button>
                  `
                  : nothing}
                <button
                  type="button"
                  @click="${this._copyText}"
                  style="${mobileContextActionStyle(isDark)}"
                >
                  ${faCopy} Copy
                </button>
                ${canEdit
                  ? html`
                    <button
                      type="button"
                      @click="${() => {
                        this._showMobileContext = false;
                        this._startEdit();
                      }}"
                      style="${mobileContextActionStyle(isDark)}"
                    >
                      ${faPen} Edit
                    </button>
                  `
                  : nothing} ${hasEdits
                  ? html`
                    <button
                      type="button"
                      @click="${() => {
                        this._showMobileContext = false;
                        this._showHistory = true;
                      }}"
                      style="${mobileContextActionStyle(isDark)}"
                    >
                      ${faHistory} View history
                    </button>
                  `
                  : nothing}
              </div>
            </div>
          `
          : nothing} ${this._showEmojiPicker
          ? renderEmojiGrid(
            isDark,
            (emoji: string) => this._toggleReaction(emoji),
            () => {
              this._showEmojiPicker = false;
            },
          )
          : nothing} ${this._showHistory && editHistory
          ? renderEditHistory(editHistory, text, isDark, () => {
            this._showHistory = false;
          })
          : nothing}
      </div>
    `;
  }

  override updated() {
    if (!this._btnEl) {
      this._btnEl = this.querySelector<HTMLButtonElement>(".msg-kebab");
    }
    if (this._menuOpen && !this._menuEl) {
      const dropdown = this._btnEl?.parentElement?.querySelector<
        HTMLDivElement
      >(
        "[style*='position:fixed']",
      );
      if (dropdown) this._menuEl = dropdown;
    }
    if (!this._menuOpen) this._menuEl = null;
  }
}

customElements.define("chat-message", ChatMessage);
