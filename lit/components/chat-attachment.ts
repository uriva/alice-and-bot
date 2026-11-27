import { html, LitElement, nothing } from "lit";
import type { Attachment } from "../../protocol/src/clientApi.ts";
import {
  isAttachmentExpiredError,
  retentionDays,
} from "../../protocol/src/retention.ts";
import { reportError } from "../core/error-reporter.ts";
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
    </style>
    <div
      style="width:40px;height:40px;border:4px solid ${isDark
        ? "#ffffff1a"
        : "#00000010"};border-top:4px solid ${isDark
        ? "#ffffff80"
        : "#00000040"};border-radius:50%;animation:spin 1s linear infinite"
    ></div>
  `;

const audioPlaceholderStyle = (isDark: boolean) =>
  `display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:20px;background:${
    isDark ? "#ffffff15" : "#00000008"
  };min-width:200px`;

const audioBtnStyle = (primaryColor: string, isDark?: boolean) =>
  `width:36px;height:36px;border-radius:50%;border:none;background:${primaryColor};color:${
    isLightColor(primaryColor, isDark) ? "#222" : "#fff"
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

const expiredAttachmentStyle = (isDark: boolean) =>
  `display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:10px;border:1px dashed ${
    isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.18)"
  };background:${
    isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"
  };color:${isDark ? "#d1d5db" : "#4b5563"};font-size:13px;max-width:280px`;

const expiredSubtitleStyle = (isDark: boolean) =>
  `font-size:11px;color:${isDark ? "#9ca3af" : "#6b7280"};margin-top:2px`;

const expiredAttachmentLabel = (
  type: Exclude<Attachment["type"], "location">,
) =>
  type === "image"
    ? "Image expired"
    : type === "video"
    ? "Video expired"
    : type === "audio"
    ? "Voice note expired"
    : "File expired";

const expiredAttachmentHtml = (
  attachment: Exclude<Attachment, { type: "location" }>,
  isDark: boolean,
) =>
  html`
    <div
      data-testid="expired-attachment"
      style="${expiredAttachmentStyle(isDark)}"
    >
      <span style="opacity:0.75">${faPaperclip}</span>
      <div style="min-width:0;flex:1">
        <div style="font-weight:500">${expiredAttachmentLabel(
          attachment.type,
        )}</div>
        <div style="${expiredSubtitleStyle(isDark)}">
          ${attachment.type === "file"
            ? `${attachment.name} · `
            : ""}Files auto-delete after ${retentionDays} days
        </div>
      </div>
    </div>
  `;

const unavailableAttachmentHtml = (isDark: boolean) =>
  html`
    <div
      data-testid="unavailable-attachment"
      style="${expiredAttachmentStyle(isDark)}"
    >
      Unable to load media
    </div>
  `;

export const isSafeAttachmentSourceUrl = (rawUrl: string): boolean => {
  if (!rawUrl || /[\p{Cc}\\]/u.test(rawUrl)) return false;
  try {
    if (decodeURIComponent(rawUrl).includes("..")) return false;
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:") return false;
    if (parsed.hostname !== "storage.googleapis.com") return false;
    return (
      parsed.pathname.startsWith("/alice-and-bot-attachments/") &&
      parsed.pathname.length > "/alice-and-bot-attachments/".length
    );
  } catch {
    return false;
  }
};

export const isSafeDecryptedMediaUrl = (rawUrl: string | null): boolean => {
  if (!rawUrl) return false;
  const cleaned = rawUrl.trim().toLowerCase();
  return cleaned.startsWith("blob:") || cleaned.startsWith("https://");
};

export const sanitizeDownloadFilename = (name: string): string => {
  const leaf = name.split(/[/\\]/).pop() ?? "";
  const base = leaf
    .replace(/\p{Cc}+/gu, "")
    .replace(/\.\.+/g, "_")
    .replace(/^\.+/, "")
    .trim();
  const nonEmpty = base || "attachment";
  return /\.(?:html?|xhtml|svg|js|mjs|xml)$/i.test(nonEmpty)
    ? `${nonEmpty}.bin`
    : nonEmpty;
};

export type DecryptAttachmentOutcome =
  | { status: "ok"; url: string }
  | { status: "expired" }
  | { status: "failed" };

export const decryptAttachmentOutcome = (
  decrypt: () => Promise<string>,
  report: (eventName: string) => void,
): Promise<DecryptAttachmentOutcome> =>
  decrypt()
    .then(
      (url): DecryptAttachmentOutcome =>
        isSafeDecryptedMediaUrl(url)
          ? { status: "ok", url }
          : { status: "failed" },
    )
    .catch((error): DecryptAttachmentOutcome => {
      if (isAttachmentExpiredError(error)) {
        return { status: "expired" };
      }
      console.error("Failed to decrypt attachment:", error);
      report("attachment_decrypt_failed");
      return { status: "failed" };
    });

export const decryptAttachmentSafely = (
  decrypt: () => Promise<string>,
  report: (eventName: string) => void,
): Promise<string | null> =>
  decryptAttachmentOutcome(decrypt, report).then((outcome) =>
    outcome.status === "ok" ? outcome.url : null
  );

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
    selectedImageSrc: {},
    longPressActive: { type: Boolean },
    _decryptedUrl: { state: true },
    _loading: { state: true },
    _expired: { state: true },
    _failed: { state: true },
  };

  declare attachment: Attachment;
  declare isDark: boolean;
  declare textColor: string;
  declare primaryColor: string;
  declare isOwn: boolean;
  declare messageTimestamp: number;
  declare sessionStart: number;
  declare onDecrypt: ((url: string) => Promise<string>) | undefined;
  declare selectedImageSrc: string | undefined;
  declare longPressActive: boolean;
  declare private _decryptedUrl: string | null;
  declare private _loading: boolean;
  declare private _expired: boolean;
  declare private _failed: boolean;

  constructor() {
    super();
    this.isDark = false;
    this.textColor = "";
    this.primaryColor = "#6366f1";
    this.isOwn = false;
    this.messageTimestamp = 0;
    this.sessionStart = 0;
    this.selectedImageSrc = undefined;
    this.longPressActive = false;
    this._decryptedUrl = null;
    this._loading = false;
    this._expired = false;
    this._failed = false;
  }

  override createRenderRoot() {
    return this;
  }

  private _handleDecrypt = async () => {
    if (
      !this.onDecrypt || this._decryptedUrl || this._expired || this._loading ||
      this.attachment.type === "location" ||
      !isSafeAttachmentSourceUrl(this.attachment.url)
    ) return;
    const { onDecrypt, attachment } = this;
    this._loading = true;
    this._failed = false;
    try {
      const outcome = await decryptAttachmentOutcome(
        () => onDecrypt(attachment.url),
        reportError,
      );
      if (outcome.status === "ok") {
        this._decryptedUrl = outcome.url;
      } else if (outcome.status === "expired") {
        this._expired = true;
      } else {
        this._failed = true;
      }
    } finally {
      this._loading = false;
    }
  };

  override connectedCallback() {
    super.connectedCallback();
    this.style.display = "block";
    this.style.maxWidth = "100%";
    this._maybeAutoDecrypt();
  }

  override updated(changed: Map<string, unknown>) {
    if (changed.has("attachment") || changed.has("onDecrypt")) {
      this._maybeAutoDecrypt();
    }
  }

  private _maybeAutoDecrypt() {
    if (
      !this.onDecrypt || this._decryptedUrl || this._expired || this._failed
    ) {
      return;
    }
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

    if (this._expired) {
      return expiredAttachmentHtml(attachment, isDark);
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
              style="${audioBtnStyle(primaryColor, isDark)}"
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
                    ></div>
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
      const isSelected = this._decryptedUrl &&
        this._decryptedUrl === this.selectedImageSrc;
      return this._decryptedUrl
        ? html`
          <img
            src="${this._decryptedUrl}"
            alt="${attachment.name}"
            style="max-width:100%;border-radius:8px;cursor:pointer;transition:transform .15s,box-shadow .15s${isSelected
              ? ";transform:scale(1.02);box-shadow:0 0 16px rgba(100,100,255,0.4)"
              : ""}${this.longPressActive && isSelected
              ? ";animation:msg-highlight .3s ease forwards"
              : ""}"
          />
        `
        : this._failed
        ? unavailableAttachmentHtml(isDark)
        : html`
          <div style="${imagePlaceholderStyle(isDark)}">${spinnerHtml(
            isDark,
          )}</div>
        `;
    }

    if (attachment.type === "video") {
      return this._decryptedUrl
        ? html`
          <chat-video-player
            .src="${this._decryptedUrl}"
            .isDark="${isDark}"
            .name="${attachment.name}"
          ></chat-video-player>
        `
        : this._failed
        ? unavailableAttachmentHtml(isDark)
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
        download="${sanitizeDownloadFilename(attachment.name)}"
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

if (!customElements.get("chat-attachment")) {
  customElements.define("chat-attachment", ChatAttachment);
}
