import { html, LitElement } from "lit";

const typingIndicatorStyle = (isDark: boolean) =>
  `padding:0 8px 6px 44px;color:${
    isDark ? "#cbd5e1" : "#475569"
  };font-size:12px`;

const typingLabel = (names: string[]) =>
  names.length === 1
    ? `${names[0]} is typing`
    : `${names.slice(0, 2).join(", ")}${
      names.length > 2 ? " and others" : ""
    } are typing`;

export class ChatTypingIndicator extends LitElement {
  static override properties = {
    names: { type: Array },
    isDark: { type: Boolean },
    _dots: { state: true },
  };

  declare names: string[];
  declare isDark: boolean;
  declare private _dots: number;
  private _interval = 0;

  constructor() {
    super();
    this.names = [];
    this.isDark = false;
    this._dots = 0;
  }

  override createRenderRoot() {
    return this;
  }

  override connectedCallback() {
    super.connectedCallback();
    this._interval = globalThis.setInterval(() => {
      this._dots = (this._dots + 1) % 4;
    }, 400);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    clearInterval(this._interval);
  }

  override render() {
    return html`
      <div style="${typingIndicatorStyle(this.isDark)}">
        ${typingLabel(
          this.names,
        )}<span style="display:inline-block;width:18px;letter-spacing:2px"
        >${".".repeat(this._dots)}</span>
      </div>
    `;
  }
}

customElements.define("chat-typing-indicator", ChatTypingIndicator);
