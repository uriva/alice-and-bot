import { html, LitElement, nothing } from "lit";
import { avatarColor } from "./design.ts";
import { compactPublicKey } from "../core/subscriptions.ts";
import { subscribeIdentityProfile } from "../core/subscriptions.ts";
import { copyToClipboard } from "./utils.ts";
import "./chat-avatar.ts";

const overlayStyle =
  "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000";

const popupStyle = (isDark: boolean) =>
  `background:${
    isDark ? "#1a1a1a" : "#fff"
  };border-radius:16px;padding:24px;min-width:260px;max-width:320px;border:1px solid ${
    isDark ? "#2a2a2a" : "#e5e7eb"
  };box-shadow:${
    isDark ? "0 8px 24px #0008" : "0 8px 24px #0002"
  };display:flex;flex-direction:column;align-items:center;gap:16px`;

const bigAvatarStyle = (baseColor: string, isDark: boolean) =>
  `display:flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:50%;background:${baseColor};box-shadow:${
    isDark ? "0 2px 8px #0004" : "0 2px 8px #0001"
  }`;

const bigAvatarImgStyle =
  "width:64px;height:64px;object-fit:cover;border-radius:50%";

const bigInitialsStyle = (baseColor: string, isDark: boolean) => {
  const light = baseColor.match(/hsl\(\d+, *\d+%, *(\d+)%\)/);
  const isLight = light ? parseInt(light[1], 10) > 60 : false;
  return `color:${
    isLight ? (isDark ? "#fff" : "#222") : "#fff"
  };font-weight:700;font-size:24px;letter-spacing:0.5px`;
};

const nameStyle = (isDark: boolean) =>
  `font-size:16px;font-weight:600;color:${isDark ? "#f4f4f4" : "#222"}`;

const idRowStyle =
  "display:flex;align-items:center;gap:8px;padding:4px 10px;border-radius:8px;background:rgba(128,128,128,0.08)";

const idTextStyle = (isDark: boolean) =>
  `font-size:13px;font-family:monospace;color:${
    isDark ? "#9ca3af" : "#6b7280"
  }`;

const copyBtnStyle = (isDark: boolean) =>
  `background:transparent;border:none;cursor:pointer;padding:2px 6px;border-radius:4px;font-size:12px;color:${
    isDark ? "#9ca3af" : "#6b7280"
  }`;

const aliasStyle = (isDark: boolean) =>
  `font-size:13px;color:${isDark ? "#9ca3af" : "#6b7280"}`;

const chatBtnStyle = (isDark: boolean) =>
  `padding:8px 20px;border-radius:8px;border:none;cursor:pointer;font-size:14px;font-weight:500;background:${
    isDark ? "#2a2a2a" : "#e5e7eb"
  };color:${isDark ? "#f4f4f4" : "#222"};transition:background 0.15s`;

const closeBtnStyle = (isDark: boolean) =>
  `padding:6px 14px;border-radius:8px;border:none;cursor:pointer;font-size:13px;background:transparent;color:${
    isDark ? "#9ca3af" : "#6b7280"
  }`;

export class UserProfilePopup extends LitElement {
  static override properties = {
    authorId: {},
    authorName: {},
    authorAvatar: {},
    isDark: { type: Boolean },
    onClose: { attribute: false },
    onChatWith: { attribute: false },
    _alias: { state: true },
    _copied: { state: true },
  };

  declare authorId: string;
  declare authorName: string;
  declare authorAvatar: string;
  declare isDark: boolean;
  declare onClose: () => void;
  declare onChatWith: ((publicSignKey: string) => void) | undefined;

  declare private _alias: string | null;
  declare private _copied: boolean;

  private _unsub: (() => void) | null = null;

  constructor() {
    super();
    this.authorId = "";
    this.authorName = "";
    this.authorAvatar = "";
    this.isDark = false;
    this.onClose = () => {};
    this._alias = null;
    this._copied = false;
  }

  override createRenderRoot() {
    return this;
  }

  override connectedCallback() {
    super.connectedCallback();
    if (this.authorId) {
      this._unsub = subscribeIdentityProfile(this.authorId, (profile) => {
        this._alias = profile?.alias ?? null;
        this.requestUpdate();
      });
    }
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._unsub?.();
  }

  private _handleCopy = async () => {
    await copyToClipboard(this.authorId);
    this._copied = true;
    setTimeout(() => {
      this._copied = false;
    }, 1500);
  };

  private _handleChatWith = () => {
    this.onChatWith?.(this.authorId);
    this.onClose();
  };

  override render() {
    const baseColor = avatarColor(this.authorId, this.isDark);
    const shortId = compactPublicKey(this.authorId);
    return html`
      <div style="${overlayStyle}" @click="${this.onClose}">
        <div style="${popupStyle(this.isDark)}" @click="${(e: Event) =>
          e.stopPropagation()}">
          ${this.authorAvatar
            ? html`
              <div style="${bigAvatarStyle(baseColor, this.isDark)}">
                <img src="${this.authorAvatar}" alt="${this
                  .authorName}" style="${bigAvatarImgStyle}" />
              </div>
            `
            : html`
              <div style="${bigAvatarStyle(baseColor, this.isDark)}">
                <span style="${bigInitialsStyle(
                  baseColor,
                  this.isDark,
                )}">${(this.authorName ?? "").slice(0, 2).toUpperCase()}</span>
              </div>
            `}
          <div style="${nameStyle(this.isDark)}">${this.authorName}</div>
          ${this._alias
            ? html`
              <div style="${aliasStyle(this.isDark)}">@${this._alias}</div>
            `
            : nothing}
          <div style="${idRowStyle}">
            <span style="${idTextStyle(this.isDark)}">${shortId}</span>
            <button type="button" style="${copyBtnStyle(
              this.isDark,
            )}" @click="${this._handleCopy}">
              ${this._copied ? "Copied!" : "Copy"}
            </button>
          </div>
          ${this.onChatWith
            ? html`
              <button type="button" style="${chatBtnStyle(
                this.isDark,
              )}" @click="${this._handleChatWith}">
                Chat with ${this.authorName}
              </button>
            `
            : nothing}
          <button type="button" style="${closeBtnStyle(
            this.isDark,
          )}" @click="${this.onClose}">
            Close
          </button>
        </div>
      </div>
    `;
  }
}

customElements.define("user-profile-popup", UserProfilePopup);
