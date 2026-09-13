import { html, LitElement, nothing } from "lit";
import { faDownload, faPlay, faShare, faVideoSlash } from "./icons.ts";
import { downloadMedia, mediaFileName, shareMedia } from "./utils.ts";

const pulseKeyframes =
  `@keyframes video-pulse{0%,100%{opacity:0.4}50%{opacity:1}}`;

const videoStyle =
  "display:block;max-width:100%;height:auto;border-radius:8px;margin-top:6px;background:#000";

const placeholderStyle = (isDark: boolean) =>
  `display:flex;align-items:center;justify-content:center;max-width:100%;width:480px;aspect-ratio:16/9;border-radius:8px;margin-top:6px;background:${
    isDark ? "#1a1a1a" : "#e5e7eb"
  }`;

const brokenStyle = (isDark: boolean) =>
  `display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;max-width:100%;width:480px;aspect-ratio:16/9;border-radius:8px;margin-top:6px;background:${
    isDark ? "#1a1a1a" : "#e5e7eb"
  };color:${isDark ? "#6b7280" : "#9ca3af"};font-size:13px`;

const actionsStyle =
  "display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:4px;color:inherit;opacity:0.85";

const actionBtnGroupStyle =
  "display:flex;align-items:center;gap:4px;margin-left:auto";

const nameStyle =
  "font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:55%;opacity:0.75";

const actionBtnStyle =
  "display:inline-flex;align-items:center;gap:4px;background:transparent;border:none;cursor:pointer;padding:3px 6px;border-radius:4px;font-size:12px;font-family:inherit;color:inherit";

export class ChatVideoPlayer extends LitElement {
  static override properties = {
    src: {},
    name: {},
    isDark: { type: Boolean },
    _state: { state: true },
  };

  declare src: string;
  declare name: string;
  declare isDark: boolean;
  declare private _state: "loading" | "ready" | "error";

  constructor() {
    super();
    this.src = "";
    this.name = "";
    this.isDark = false;
    this._state = "loading";
  }

  override createRenderRoot() {
    return this;
  }

  private _onLoaded = () => {
    this._state = "ready";
  };

  private _onError = () => {
    this._state = "error";
  };

  private _handleShare = () => {
    if (!this.src) return;
    shareMedia({
      src: this.src,
      name: this.name || mediaFileName(this.src),
      fallbackTitle: "Video",
    });
  };

  private _handleDownload = () => {
    if (!this.src) return;
    downloadMedia({
      src: this.src,
      name: this.name || mediaFileName(this.src),
    });
  };

  override render() {
    if (this._state === "error") {
      return html`
        <div style="${brokenStyle(this.isDark)}">
          <span style="font-size:32px;opacity:0.5">${faVideoSlash}</span>
          <span>Video unavailable :(</span>
        </div>
      `;
    }
    const hiddenStyle = this._state === "loading"
      ? `${videoStyle};position:absolute;opacity:0`
      : videoStyle;
    return html`
      <style>
      ${pulseKeyframes}
      </style>
      ${this._state === "loading"
        ? html`
          <div style="${placeholderStyle(this.isDark)}">
            <span
              style="color:${this.isDark
                ? "#555"
                : "#9ca3af"};font-size:36px;animation:video-pulse 1.5s ease-in-out infinite"
            >${faPlay}</span>
          </div>
        `
        : nothing}
      <video
        src="${this.src}"
        controls
        preload="metadata"
        playsinline
        style="${hiddenStyle}"
        @loadedmetadata="${this._onLoaded}"
        @error="${this._onError}"
      ></video>
      <div style="${actionsStyle}">
        ${this.name
          ? html`<span style="${nameStyle}" title="${this.name}">${this.name}</span>`
          : nothing}
        <div style="${actionBtnGroupStyle}">
          <button
            type="button"
            @click="${this._handleShare}"
            style="${actionBtnStyle}"
            title="Share video"
          >
            ${faShare} Share
          </button>
          <button
            type="button"
            @click="${this._handleDownload}"
            style="${actionBtnStyle}"
            title="Download video"
          >
            ${faDownload} Download
          </button>
        </div>
      </div>
    `;
  }
}

if (!customElements.get("chat-video-player")) {
  customElements.define("chat-video-player", ChatVideoPlayer);
}
