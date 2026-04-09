import { html, LitElement } from "lit";
import { isLightColor } from "./design.ts";
import { faPause, faPlay } from "./icons.ts";
import { formatDuration } from "./utils.ts";

const playerStyle = (isDark: boolean) =>
  `display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:20px;background:${
    isDark ? "#ffffff15" : "#00000008"
  };min-width:200px`;

const playBtnStyle = (primaryColor: string) =>
  `width:36px;height:36px;border-radius:50%;border:none;background:${primaryColor};color:${
    isLightColor(primaryColor) ? "#222" : "#fff"
  };cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0`;

const barColor = (isPlayed: boolean, primaryColor: string, isDark: boolean) =>
  isPlayed ? primaryColor : (isDark ? "#ffffff40" : "#00000020");

const barHeight = (i: number) => 6 + Math.sin(i * 0.8) * 6 + Math.random() * 4;

const bars = Array.from({ length: 30 }, (_, i) => ({
  index: i,
  height: barHeight(i),
}));

export class ChatAudioPlayer extends LitElement {
  static override properties = {
    src: {},
    isDark: { type: Boolean },
    fallbackDuration: { type: Number },
    primaryColor: {},
    _playing: { state: true },
    _currentTime: { state: true },
    _duration: { state: true },
  };

  src = "";
  isDark = false;
  fallbackDuration = 0;
  primaryColor = "#6366f1";
  private _playing = false;
  private _currentTime = 0;
  private _duration = 0;

  override createRenderRoot() {
    return this;
  }

  private get _audio(): HTMLAudioElement | null {
    return this.querySelector("audio");
  }

  private _onTimeUpdate = () => {
    if (this._audio) this._currentTime = this._audio.currentTime;
  };

  private _onLoadedMetadata = () => {
    if (!this._audio) return;
    const dur = this._audio.duration;
    if (isFinite(dur) && !isNaN(dur)) this._duration = dur;
    else if (this.fallbackDuration) this._duration = this.fallbackDuration;
  };

  private _onEnded = () => {
    this._playing = false;
  };

  private _togglePlay = () => {
    if (!this._audio) return;
    if (this._playing) this._audio.pause();
    else this._audio.play();
    this._playing = !this._playing;
  };

  private _seek = (e: MouseEvent) => {
    if (!this._audio || !this._duration) return;
    const rect = (e.currentTarget! as HTMLElement).getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    this._audio.currentTime = percent * this._duration;
  };

  override render() {
    const progress = this._duration
      ? (this._currentTime / this._duration) * 100
      : 0;
    const dur = this._duration || this.fallbackDuration;
    return html`
      <div style="${playerStyle(this.isDark)}">
        <audio
          src="${this.src}"
          preload="metadata"
          @timeupdate="${this._onTimeUpdate}"
          @loadedmetadata="${this._onLoadedMetadata}"
          @ended="${this._onEnded}"
        >
        </audio>
        <button type="button" @click="${this
          ._togglePlay}" style="${playBtnStyle(this.primaryColor)}">
          ${this._playing ? faPause : faPlay}
        </button>
        <div style="flex:1;display:flex;flex-direction:column;gap:4px">
          <div
            @click="${this._seek}"
            style="height:24px;cursor:pointer;display:flex;align-items:center;gap:2px"
          >
            ${bars.map(({ index, height }) => {
              const played = (index / 30) * 100 < progress;
              return html`
                <div
                  style="width:3px;height:${height}px;border-radius:2px;background:${barColor(
                    played,
                    this.primaryColor,
                    this.isDark,
                  )};transition:background 0.1s"
                >
                </div>
              `;
            })}
          </div>
          <div
            style="font-size:11px;color:${this.isDark
              ? "#9ca3af"
              : "#64748b"};display:flex;justify-content:space-between"
          >
            <span>${formatDuration(Math.floor(this._currentTime))}</span>
            <span>${dur ? formatDuration(Math.floor(dur)) : "--:--"}</span>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define("chat-audio-player", ChatAudioPlayer);
