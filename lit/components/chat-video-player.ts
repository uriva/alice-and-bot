import { html, LitElement, nothing } from "lit";
import { faPlay, faVideoSlash } from "./icons.ts";

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

export class ChatVideoPlayer extends LitElement {
  static override properties = {
    src: {},
    isDark: { type: Boolean },
    _state: { state: true },
  };

  src = "";
  isDark = false;
  private _state: "loading" | "ready" | "error" = "loading";

  override createRenderRoot() {
    return this;
  }

  private _onLoaded = () => {
    this._state = "ready";
  };

  private _onError = () => {
    this._state = "error";
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
      >
      </video>
    `;
  }
}

customElements.define("chat-video-player", ChatVideoPlayer);
