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
import { faEllipsisV, faHistory, faPen, faPhoneAlt } from "./icons.ts";
import { fencedCodeHoverCss, renderMarkdown } from "./markdown.ts";
import type {
  AbstracChatMessage,
  CustomColors,
  DiffPart,
  EditHistoryEntry,
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

export class ChatMessage extends LitElement {
  static override properties = {
    msg: { attribute: false },
    prev: { attribute: false },
    isOwn: { type: Boolean },
    onDecryptAttachment: { attribute: false },
    sessionStart: { type: Number },
    onEdit: { attribute: false },
    customColors: { attribute: false },
    isDark: { type: Boolean },
    _isEditing: { state: true },
    _editText: { state: true },
    _showHistory: { state: true },
    _menuOpen: { state: true },
    _timeAgo: { state: true },
  };

  msg!: AbstracChatMessage;
  prev?: AbstracChatMessage;
  isOwn = false;
  onDecryptAttachment?: (url: string) => Promise<string>;
  sessionStart = 0;
  onEdit?: (newText: string) => void;
  customColors?: CustomColors;
  isDark = false;

  private _isEditing = false;
  private _editText = "";
  private _showHistory = false;
  private _menuOpen = false;
  private _timeAgo = "";
  private _timeInterval = 0;
  private _btnEl: HTMLButtonElement | null = null;
  private _menuEl: HTMLDivElement | null = null;
  private _outsideClickHandler: ((e: MouseEvent) => void) | null = null;

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
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    clearInterval(this._timeInterval);
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
    const markdownHtml = renderMarkdown(text, textColor, isDark);
    const canSave = !!this._editText.trim() &&
      this._editText !== text;

    return html`
      <style>
      ${kebabHoverCss}${fencedCodeHoverCss}
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
            ></chat-avatar>
          `
          : nothing}
        <div
          class="msg-bubble"
          style="background:${noBubble
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
            : "0"};max-width:80%;overflow-x:hidden;overflow-y:hidden;word-break:break-word;overflow-wrap:anywhere"
        >
          ${isStartOfSequence && !isOwn && !customColors?.hideNames
            ? html`
              <b data-testid="author-name" style="font-size:11px;color:${participantColor}"
              >${authorName}</b>
            `
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
            : text
            ? html`
              <div
                data-testid="message-text"
                dir="auto"
                style="overflow-wrap:anywhere;word-break:break-word;min-width:0;${callDetails
                  ? "display:flex;align-items:center;gap:8px"
                  : ""}"
              >
                ${callDetails ? faPhoneAlt : nothing} ${unsafeHTML(
                  markdownHtml,
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
                          this._btnEl?.getBoundingClientRect() ?? new DOMRect(),
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
        ${this._showHistory && editHistory
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
