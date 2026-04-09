import { html, LitElement } from "lit";
import { faMapMarkerAlt } from "./icons.ts";
import {
  cartoTileUrl,
  googleMapsUrl,
  locationCardHeight,
  locationCardWidth,
  locationTileGrid,
} from "./utils.ts";

const tileSize = 256;

const cardStyle =
  `display:block;position:relative;width:${locationCardWidth}px;height:${locationCardHeight}px;border-radius:8px;overflow:hidden;text-decoration:none;color:inherit`;

const pinStyle =
  "position:absolute;left:50%;top:50%;transform:translate(-50%,-100%);filter:drop-shadow(0 1px 2px rgba(0,0,0,0.4));pointer-events:none";

const labelStyle =
  "position:absolute;bottom:0;left:0;right:0;padding:16px 8px 6px;background:linear-gradient(transparent,rgba(0,0,0,0.6));color:#fff;font-size:13px;font-weight:500";

export class ChatLocationCard extends LitElement {
  static override properties = {
    latitude: { type: Number },
    longitude: { type: Number },
    label: {},
  };

  latitude = 0;
  longitude = 0;
  label = "";

  override createRenderRoot() {
    return this;
  }

  override render() {
    const { tiles, offsetX, offsetY } = locationTileGrid(
      this.latitude,
      this.longitude,
    );
    return html`
      <a
        data-testid="location-attachment"
        href="${googleMapsUrl(this.latitude, this.longitude)}"
        target="_blank"
        rel="noopener noreferrer"
        style="${cardStyle}"
      >
        <div
          style="position:absolute;left:${offsetX}px;top:${offsetY}px;width:${tileSize *
            2}px;height:${tileSize *
            2}px;display:grid;grid-template-columns:${tileSize}px ${tileSize}px"
        >
          ${tiles.map(
            ({ x, y }) =>
              html`
                <img
                  src="${cartoTileUrl(x, y)}"
                  alt=""
                  style="width:${tileSize}px;height:${tileSize}px;display:block"
                />
              `,
          )}
        </div>
        <div style="${pinStyle}">${faMapMarkerAlt}</div>
        ${this.label
          ? html`
            <div style="${labelStyle}">${this.label}</div>
          `
          : ""}
      </a>
    `;
  }
}

customElements.define("chat-location-card", ChatLocationCard);
