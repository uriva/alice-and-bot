import { html, LitElement, nothing } from "lit";
import type { Attachment } from "../../protocol/src/clientApi.ts";
import { isLightColor } from "./design.ts";
import "./chat-audio-player.ts";
import "./chat-location-card.ts";
import "./chat-video-player.ts";
import { faDownload, faPaperclip } from "./icons.ts";
import { formatDuration, formatFileSize } from "./utils.ts";

const spinKeyframes =
  "@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}";

const spinnerHtml = (isDark: boolean) =>
  html`
    <style>
    ${spinKeyframes}
    </style><div
      style="width:40px;height:40px;border:4px solid ${isDark
        ? "#ffffff1a"
        : "#00000010"};border-top:4px solid ${isDark
        ? "#ffffff80"
        : "#00000040"};border-radius:50%;animation:spin 1s linear infinite"
    >
    </div>
  `;

const audioPlaceholderStyle = (isDark: boolean) =>
  `display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:20px;background:${
    isDark ? "#ffffff15" : "#00000008"
  };min-width:200px`;

const audioBtnStyle = (primaryColor: string) =>
  `width:36px;height:36px;border-radius:50%;border:none;background:${primaryColor};color:${
    isLightColor(primaryColor) ? "#222" : "#fff"
  };cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0`;

const audioBars = Array.from({ length: 30 }, (_, i) => ({
  index: i,
  height: 6 + Math.sin(i * 0.8) * 6,
}));

const fileStyle = (isDark: boolean) =>
  `display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;background:${
    isDark ? "#ffffff15" : "#00000010"
  };text-decoration:none;color:inherit`;

const imagePlaceholderStyle = (isDark: boolean) =>
  `width:200px;height:150px;border-radius:8px;background:${
    isDark ? "#ffffff10" : "#00000008"
  };display:flex;align-items:center;justify-content:center`;

const videoPlaceholderStyle = (isDark: boolean) =>
  `display:flex;align-items:center;justify-content:center;max-width:100%;width:480px;aspect-ratio:16/9;border-radius:8px;margin-top:6px;background:${
    isDark ? "#1a1a1a" : "#e5e7eb"
  }`;

export class ChatAttachment extends LitElement {
  static override properties = {
    attachment: { attribute: false },
    isDark: { type: Boolean },
    textColor: {},
    primaryColor: {},
    isOwn: { type: Boolean },
    messageTimestamp: { type: Number },
    sessionStart: { type: Number },
    onDecrypt: { attribute: false },
    _decryptedUrl: { state: true },
    _loading: { state: true },
  };

  attachment!: Attachment;
  isDark = false;
  textColor = "";
  primaryColor = "#6366f1";
  isOwn = false;
  messageTimestamp = 0;
  sessionStart = 0;
  onDecrypt?: (url: string) => Promise<string>;
  private _decryptedUrl: string | null = null;
  private _loading = false;

  override createRenderRoot() {
    return this;
  }

  private _handleDecrypt = async () => {
    if (
      !this.onDecrypt || this._decryptedUrl ||
      this.attachment.type === "location"
    ) return;
    this._loading = true;
    this._decryptedUrl = await this.onDecrypt(this.attachment.url);
    this._loading = false;
  };

  override connectedCallback() {
    super.connectedCallback();
    this._maybeAutoDecrypt();
  }

  override updated(changed: Map<string, unknown>) {
    if (changed.has("attachment") || changed.has("onDecrypt")) {
      this._maybeAutoDecrypt();
    }
  }

  private _maybeAutoDecrypt() {
    if (!this.onDecrypt || this._decryptedUrl) return;
    const { type } = this.attachment;
    if (type === "image" || type === "video") {
      this._handleDecrypt();
      return;
    }
    const isFromThisSession = this.messageTimestamp && this.sessionStart &&
      this.messageTimestamp >= this.sessionStart;
    if (this.isOwn && isFromThisSession && type === "audio") {
      this._handleDecrypt();
    }
  }

  override render() {
    const { attachment, isDark, primaryColor, textColor } = this;

    if (attachment.type === "location") {
      return html`
        <chat-location-card
          .latitude="${attachment.latitude}"
          .longitude="${attachment.longitude}"
          .label="${attachment.label ?? ""}"
        ></chat-location-card>
      `;
    }

    if (attachment.type === "audio") {
      return this._decryptedUrl
        ? html`
          <chat-audio-player
            .src="${this._decryptedUrl}"
            .isDark="${isDark}"
            .fallbackDuration="${attachment.duration ?? 0}"
            .primaryColor="${primaryColor}"
          ></chat-audio-player>
        `
        : html`
          <div style="${audioPlaceholderStyle(isDark)}">
            <button
              type="button"
              @click="${this._handleDecrypt}"
              ?disabled="${this._loading}"
              style="${audioBtnStyle(primaryColor)}"
            >
              ${this._loading ? spinnerHtml(isDark) : faDownload}
            </button>
            <div style="flex:1;display:flex;flex-direction:column;gap:4px">
              <div style="height:24px;display:flex;align-items:center;gap:2px">
                ${audioBars.map(({ height }) =>
                  html`
                    <div
                      style="width:3px;height:${height}px;border-radius:2px;background:${isDark
                        ? "#ffffff40"
                        : "#00000020"}"
                    >
                    </div>
                  `
                )}
              </div>
              ${attachment.duration !== undefined
                ? html`
                  <div style="font-size:11px;color:${isDark
                    ? "#9ca3af"
                    : "#64748b"}">${formatDuration(attachment.duration)}</div>
                `
                : nothing}
            </div>
          </div>
        `;
    }

    if (attachment.type === "image") {
      return this._decryptedUrl
        ? html`
          <img
            src="${this._decryptedUrl}"
            alt="${attachment.name}"
            style="max-width:100%;border-radius:8px;cursor:pointer"
          />
        `
        : html`
          <div style="${imagePlaceholderStyle(isDark)}">${spinnerHtml(
            isDark,
          )}</div>
        `;
    }

    if (attachment.type === "video") {
      return this._decryptedUrl
        ? html`
          <video controls preload="metadata" style="max-width:100%;border-radius:8px">
            <source src="${this._decryptedUrl}" type="${attachment.mimeType}" />
          </video>
        `
        : html`
          <div style="${videoPlaceholderStyle(isDark)}">${spinnerHtml(
            isDark,
          )}</div>
        `;
    }

    return html`
      <a
        href="${this._decryptedUrl ?? "#"}"
        @click="${async (e: Event) => {
          if (!this._decryptedUrl && this.onDecrypt) {
            e.preventDefault();
            await this._handleDecrypt();
          }
        }}"
        download="${attachment.name}"
        style="${fileStyle(isDark)}"
      >
        <span>${faPaperclip}</span>
        <div style="flex:1">
          <div style="color:${textColor};font-size:13px">${attachment
            .name}</div>
          <div style="color:${textColor};font-size:11px;opacity:0.7">${formatFileSize(
            attachment.size,
          )}</div>
        </div>
      </a>
    `;
  }
}

customElements.define("chat-attachment", ChatAttachment);
