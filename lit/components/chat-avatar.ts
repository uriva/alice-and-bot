import { html, LitElement } from "lit";
import { isLightColor } from "./design.ts";

const avatarContainerStyle = (baseColor: string, isDark: boolean) =>
  `display:flex;align-items:center;justify-content:center;flex-shrink:0;width:32px;height:32px;padding:4px;border-radius:50%;background:${baseColor};box-shadow:${
    isDark ? "0 1px 4px #0004" : "0 1px 4px #0001"
  };transition:background 0.2s,box-shadow 0.2s`;

const initialsColor = (baseColor: string, isDark: boolean) =>
  isLightColor(baseColor) ? (isDark ? "#fff" : "#222") : "#fff";

export class ChatAvatar extends LitElement {
  static override properties = {
    image: {},
    name: {},
    baseColor: {},
    isDark: { type: Boolean },
  };

  image = "";
  name = "";
  baseColor = "";
  isDark = false;

  override createRenderRoot() {
    return this;
  }

  override render() {
    return html`
      <div style="${avatarContainerStyle(this.baseColor, this.isDark)}">
        ${this.image
          ? html`
            <img
              src="${this.image}"
              alt="${this.name}"
              style="object-fit:cover;border-radius:50%"
            />
          `
          : html`
            <span
              style="color:${initialsColor(
                this.baseColor,
                this.isDark,
              )};font-weight:700;font-size:15px;letter-spacing:0.5px"
            >${(this.name ?? "").slice(0, 2).toUpperCase()}</span>
          `}
      </div>
    `;
  }
}

customElements.define("chat-avatar", ChatAvatar);
