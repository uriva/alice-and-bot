import { html, LitElement, nothing, type TemplateResult } from "lit";
import type {
  Credentials,
  DecipheredMessage,
} from "../protocol/src/clientApi.ts";
import { sendCanvasEvent } from "../protocol/src/clientApi.ts";
import {
  subscribeConversationKey,
  subscribeDecryptedMessages,
} from "../lit/core/subscriptions.ts";
import { accessDb } from "../lit/core/instant-client.ts";
import {
  actOnCanvas,
  type CanvasEvent,
  type CanvasProblem,
  renderCanvas,
} from "./runtime.ts";
import { isRenderableTag, type ViewElement, type ViewNode } from "./view.ts";
import { canvasFromRow, canvasQuery, type StoredCanvas } from "./store.ts";

export const toastLifetimeMs = 5_000;

export const canvasViewCss = (isDark: boolean) => `
.canvas-view {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  color: ${isDark ? "#f3f4f6" : "#1f2937"};
  background: var(--canvas-view-bg, ${isDark ? "#111827" : "#ffffff"});
  font-family: inherit;
}
.canvas-view-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 2rem 1.5rem;
}
.canvas-view-toasts {
  position: absolute;
  inset-inline: 0;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem;
  pointer-events: none;
  z-index: 20;
}
.canvas-view-toast {
  align-self: center;
  max-width: 34rem;
  padding: 0.5rem 1rem;
  border-radius: 999px;
  background: ${isDark ? "#1f2937" : "#ffffff"};
  border: 1px solid ${isDark ? "#374151" : "#e5e7eb"};
  color: ${isDark ? "#f9fafb" : "#111827"};
  box-shadow: 0 10px 25px -5px rgba(0,0,0,0.2), 0 8px 10px -6px rgba(0,0,0,0.1);
  font-size: 0.875rem;
  font-weight: 500;
  animation: canvas-toast ${toastLifetimeMs}ms ease forwards;
}
.canvas-view-error {
  margin: 1rem 1.5rem;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  border: 1px solid ${isDark ? "#5c2b2b" : "#f0c8c8"};
  background: ${isDark ? "#2a1616" : "#fff5f5"};
  color: ${isDark ? "#ffb4b4" : "#8a1f1f"};
  font-size: 0.85rem;
  white-space: pre-wrap;
}
.canvas-view-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 1.5rem;
  text-align: center;
  color: ${isDark ? "#9ca3af" : "#6b7280"};
  font-size: 1rem;
}
.canvas-page {
  width: 100%;
  max-width: 64rem;
  margin: 0 auto;
}
.canvas-hero {
  text-align: center;
  padding: 3rem 1rem 2rem 1rem;
}
.canvas-hero h1 {
  font-size: 2.25rem;
  font-weight: 700;
  letter-spacing: -0.025em;
  margin: 0.75rem 0 0.875rem 0;
  color: ${isDark ? "#f9fafb" : "#111827"};
}
.canvas-hero p, .canvas-lead {
  font-size: 1.125rem;
  line-height: 1.6;
  opacity: 0.85;
  max-width: 34rem;
  margin: 0 auto;
}
.canvas-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.25rem;
  margin-top: 1.5rem;
}
.canvas-card {
  padding: 1.5rem;
  border-radius: 0.75rem;
  background: ${isDark ? "#1e293b" : "#ffffff"};
  border: 1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"};
  box-shadow: 0 4px 6px -1px rgba(0,0,0,0.08);
  display: flex;
  flex-direction: column;
}
.canvas-card h3 {
  margin: 0 0 0.5rem 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: ${isDark ? "#f8fafc" : "#0f172a"};
}
.canvas-card-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  justify-content: space-between;
  gap: 1rem;
}
.canvas-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.625rem 1.25rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid ${isDark ? "#3b82f6" : "#2563eb"};
  background: ${isDark ? "#2563eb" : "#2563eb"};
  color: #ffffff;
  transition: all 0.15s ease;
  text-decoration: none;
}
.canvas-btn:hover {
  opacity: 0.92;
  transform: translateY(-1px);
}
.canvas-badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.025em;
  background: ${isDark ? "rgba(59,130,246,0.2)" : "rgba(37,99,235,0.1)"};
  color: ${isDark ? "#60a5fa" : "#2563eb"};
  border: 1px solid ${isDark ? "rgba(59,130,246,0.3)" : "rgba(37,99,235,0.2)"};
}
.canvas-row {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}
.canvas-col {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.canvas-input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  border: 1px solid ${isDark ? "#374151" : "#d1d5db"};
  background: ${isDark ? "#111827" : "#ffffff"};
  color: inherit;
}
@keyframes canvas-toast {
  0% { opacity: 0; transform: translateY(-0.5rem); }
  8% { opacity: 1; transform: translateY(0); }
  75% { opacity: 1; }
  100% { opacity: 0; transform: translateY(-0.25rem); }
}
@media (prefers-reduced-motion: reduce) {
  .canvas-view-toast { animation: none; opacity: 1; }
}
`;

const collectFields = (target: EventTarget | null) => {
  const fields: Record<string, string> = {};
  if (!(target instanceof HTMLFormElement)) return fields;
  new FormData(target).forEach((value, key) => {
    fields[key] = String(value);
  });
  return fields;
};

const renderNode = (
  node: ViewNode,
  onAction: (action: string, fields: Record<string, string>) => void,
): TemplateResult | typeof nothing => {
  if (typeof node === "string" || typeof node === "number") {
    return html`${node}`;
  }
  const tag = node.tag.toLowerCase();
  if (!isRenderableTag(tag)) return nothing;
  const className = node.attrs?.class?.split(/\s+/).filter(Boolean).join(" ") ??
    "";
  const children = (node.children ?? []).map((child) =>
    renderNode(child, onAction)
  );
  const clickHandler = node.on?.click
    ? (e: Event) => {
      e.preventDefault();
      onAction(node.on!.click, {});
    }
    : undefined;
  const submitHandler = node.on?.submit
    ? (e: Event) => {
      e.preventDefault();
      onAction(node.on!.submit, collectFields(e.currentTarget));
    }
    : undefined;

  if (tag === "button") {
    return html`
      <button class="canvas-el ${className}" type="button"
        @click=${clickHandler}>${node.text ?? nothing}${children}</button>
    `;
  }
  if (tag === "form") {
    return html`
      <form class="canvas-el ${className}"
        @submit=${submitHandler}>${node.text ?? nothing}${children}</form>
    `;
  }
  if (tag === "input") {
    return html`
      <input class="canvas-el ${className}" name=${node.attrs?.name ??
        nothing} placeholder=${node.attrs?.placeholder ?? nothing}
        .value=${node.attrs?.value ?? ""} />
    `;
  }
  if (tag === "textarea") {
    return html`
      <textarea class="canvas-el ${className}" name=${node.attrs?.name ??
        nothing}
        placeholder=${node.attrs?.placeholder ?? nothing}>${node.text ??
          ""}</textarea>
    `;
  }
  if (tag === "a") {
    return html`
      <a class="canvas-el ${className}" href=${node.attrs?.href ?? "#"}
        @click=${clickHandler}>${node.text ?? nothing}${children}</a>
    `;
  }
  if (tag === "img") {
    return html`<img class="canvas-el ${className}" src=${
      node.attrs?.src ?? ""
    } alt=${node.attrs?.alt ?? ""} />`;
  }
  if (tag === "label") {
    return html`
      <label class="canvas-el ${className}"
        for=${node.attrs?.for ?? nothing}>${node.text ??
          nothing}${children}</label>
    `;
  }
  if (tag === "h1") {
    return html`<h1 class="canvas-el ${className}">${
      node.text ?? nothing
    }${children}</h1>`;
  }
  if (tag === "h2") {
    return html`<h2 class="canvas-el ${className}">${
      node.text ?? nothing
    }${children}</h2>`;
  }
  if (tag === "h3") {
    return html`<h3 class="canvas-el ${className}">${
      node.text ?? nothing
    }${children}</h3>`;
  }
  if (tag === "h4") {
    return html`<h4 class="canvas-el ${className}">${
      node.text ?? nothing
    }${children}</h4>`;
  }
  if (tag === "p") {
    return html`<p class="canvas-el ${className}">${
      node.text ?? nothing
    }${children}</p>`;
  }
  if (tag === "span") {
    return html`<span class="canvas-el ${className}">${
      node.text ?? nothing
    }${children}</span>`;
  }
  if (tag === "strong") {
    return html`<strong class="canvas-el ${className}">${
      node.text ?? nothing
    }${children}</strong>`;
  }
  if (tag === "em") {
    return html`<em class="canvas-el ${className}">${
      node.text ?? nothing
    }${children}</em>`;
  }
  if (tag === "small") {
    return html`<small class="canvas-el ${className}">${
      node.text ?? nothing
    }${children}</small>`;
  }
  if (tag === "ul") {
    return html`<ul class="canvas-el ${className}">${children}</ul>`;
  }
  if (tag === "li") {
    return html`<li class="canvas-el ${className}">${
      node.text ?? nothing
    }${children}</li>`;
  }
  if (tag === "code") {
    return html`<code class="canvas-el ${className}">${
      node.text ?? nothing
    }${children}</code>`;
  }
  if (tag === "pre") {
    return html`<pre class="canvas-el ${className}">${
      node.text ?? nothing
    }${children}</pre>`;
  }
  if (tag === "blockquote") {
    return html`<blockquote class="canvas-el ${className}">${
      node.text ?? nothing
    }${children}</blockquote>`;
  }
  if (tag === "section") {
    return html`<section class="canvas-el ${className}">${children}</section>`;
  }
  if (tag === "header") {
    return html`<header class="canvas-el ${className}">${children}</header>`;
  }
  if (tag === "footer") {
    return html`<footer class="canvas-el ${className}">${children}</footer>`;
  }
  if (tag === "nav") {
    return html`<nav class="canvas-el ${className}">${children}</nav>`;
  }
  if (tag === "main") {
    return html`<main class="canvas-el ${className}">${children}</main>`;
  }
  return html`<div class="canvas-el ${className}">${
    node.text ?? nothing
  }${children}</div>`;
};

export const canvasActions = (
  view: ViewElement,
): string[] => {
  const found: string[] = [];
  const walk = (node: ViewNode) => {
    if (typeof node === "string" || typeof node === "number") return;
    Object.values(node.on ?? {}).forEach((action) => {
      if (!found.includes(action)) found.push(action);
    });
    (node.children ?? []).forEach(walk);
  };
  walk(view);
  return found;
};

const problemText = (problems: CanvasProblem[]) =>
  problems.map((problem) => `${problem.stage}: ${problem.message}`).join(
    "\n\n",
  );

const messageToast = (text: string, authorName: string) =>
  authorName ? `${authorName}: ${text}` : text;

export class CanvasView extends LitElement {
  static override properties = {
    credentials: { attribute: false },
    conversationId: { attribute: false },
    isDark: { type: Boolean },
    emptyMessage: { type: String },
    initialText: { type: String },
    authorNames: { attribute: false },
  };

  declare credentials: Credentials | undefined;
  declare conversationId: string;
  declare isDark: boolean;
  declare emptyMessage: string;
  declare initialText: string;
  declare authorNames: Readonly<Record<string, string>>;

  constructor() {
    super();
    this.conversationId = "";
    this.isDark = false;
    this.emptyMessage = "Nothing here yet";
    this.initialText = "";
    this.authorNames = {};
  }

  private _canvas: StoredCanvas | undefined;
  private _view: ViewElement | undefined;
  private _problems: CanvasProblem[] = [];
  private _toasts: { readonly id: string; readonly text: string }[] = [];
  private _seenMessages = 0;
  private _unsubKey: (() => void) | undefined;
  private _watchersOff: (() => void)[] = [];

  override createRenderRoot(): HTMLElement {
    return this;
  }

  override firstUpdated(changed: Map<string, unknown>) {
    super.firstUpdated(changed);
    this._render();
  }

  override connectedCallback() {
    super.connectedCallback();
    if (!this._view && this.initialText) {
      renderCanvas({ body: this.initialText }).then((result) => {
        if (result.ok && !this._canvas) {
          this._view = result.view;
          this.requestUpdate();
        }
      });
    }
    this._watch();
  }

  override disconnectedCallback() {
    this._unsubscribe();
    super.disconnectedCallback();
  }

  override willUpdate(changed: Map<string, unknown>) {
    if (
      changed.has("conversationId") || changed.has("credentials") ||
      changed.has("_canvas") || changed.has("initialText")
    ) {
      this._render();
    }
  }

  private _stopWatchers() {
    this._watchersOff.forEach((off) => off());
    this._watchersOff = [];
  }

  private _unsubscribe() {
    this._unsubKey?.();
    this._unsubKey = undefined;
    this._stopWatchers();
  }

  private _watch() {
    this._unsubscribe();
    const { credentials, conversationId } = this;
    if (!credentials || !conversationId) return;
    this._unsubKey = subscribeConversationKey(
      conversationId,
      credentials,
      (key) => {
        this._stopWatchers();
        this._seenMessages = 0;
        if (!key) return this._setCanvas(undefined);
        this._watchCanvas(key);
        this._watchMessages(key);
      },
    );
  }

  private _watchCanvas(key: string) {
    let lastVersion: number | undefined;
    const stop = accessDb().subscribeQuery(
      canvasQuery(this.conversationId),
      ({ data, error }) => {
        if (error) return console.error("canvas subscription failed", error);
        const rawCanvas = data?.conversations[0]?.canvas;
        const row = Array.isArray(rawCanvas) ? rawCanvas[0] : rawCanvas;
        if (row?.version === lastVersion) return;
        lastVersion = row?.version;
        canvasFromRow(row, key).then(
          (canvas) => this._setCanvas(canvas),
          (failure) =>
            this._problems = [{
              stage: "render",
              message: `canvas could not be decrypted: ${
                failure instanceof Error ? failure.message : String(failure)
              }`,
            }],
        );
      },
    );
    this._watchersOff.push(() => {
      stop();
      lastVersion = undefined;
    });
  }

  private _watchMessages(key: string) {
    const unsub = subscribeDecryptedMessages(
      this.conversationId,
      key,
      ({ messages }) => this._onMessages(messages ?? []),
    );
    this._watchersOff.push(unsub);
  }

  private _setCanvas(canvas: StoredCanvas | undefined) {
    this._canvas = canvas;
    this._render();
  }

  private _render() {
    const canvasText = this._canvas?.text?.trim();
    const body = canvasText && !canvasText.includes("This canvas is empty")
      ? canvasText
      : this.initialText;
    if (!body) {
      this._view = undefined;
      this._problems = [];
      return;
    }
    renderCanvas({ body }).then((result) => this._applyRender(result));
  }

  private _applyRender(result: Awaited<ReturnType<typeof renderCanvas>>) {
    if (!result.ok) {
      this._view = undefined;
      this._problems = result.problems;
      this.requestUpdate();
      return;
    }
    this._view = result.view;
    this._problems = [];
    this.requestUpdate();
  }

  private _act = (action: string, fields: Record<string, string>) => {
    const body = this._canvas?.text || this.initialText;
    const { credentials, conversationId } = this;
    if (!body || !credentials || !conversationId) return;
    actOnCanvas({ body, action, fields }).then((result) => {
      if (!result.ok) {
        this._problems = result.problems;
        this.requestUpdate();
        return;
      }
      result.emitted.forEach((event: CanvasEvent) => {
        const actionLabel = event.action
          .replace(/^choose_lang_|^create_|^configure_/, "")
          .replace(/_/g, " ");
        this._toast(`⚡ ${actionLabel}`);
        this.dispatchEvent(
          new CustomEvent("canvas-action", { detail: event, bubbles: true }),
        );
        sendCanvasEvent({
          credentials,
          conversation: conversationId,
          action: event.action,
          data: event.data,
        }).catch((error) =>
          console.error("failed to send canvas event", error)
        );
      });
      if (result.view) this._view = result.view;
      this._problems = [];
      this.requestUpdate();
    });
  };

  private _onMessages = (messages: DecipheredMessage[]) => {
    if (this._seenMessages === 0) {
      this._seenMessages = messages.length;
      return;
    }
    const fresh = messages.slice(this._seenMessages);
    this._seenMessages = messages.length;
    fresh
      .filter((message) => message.type === "text")
      .forEach((message) =>
        this._toast(
          messageToast(
            message.text,
            this.authorNames[message.publicSignKey] ?? "",
          ),
        )
      );
  };

  private _toast(text: string) {
    const id = crypto.randomUUID();
    this._toasts = [...this._toasts, { id, text }];
    setTimeout(() => {
      this._toasts = this._toasts.filter((toast) => toast.id !== id);
      this.requestUpdate();
    }, toastLifetimeMs);
    this.requestUpdate();
  }

  override render(): TemplateResult {
    const onAction = (action: string, fields: Record<string, string>) =>
      this._act(action, fields);
    return html`
      <style>${canvasViewCss(this.isDark)}</style>
      <div class="canvas-view">
              ${this._toasts.length === 0 ? nothing : html`
                <div class="canvas-view-toasts">
                  ${this._toasts.map((toast) =>
                    html`
                      <div class="canvas-view-toast" .dataId=${toast.id}>${toast
                        .text}</div>
                    `
                  )}
                </div>
              `}
              ${this._problems.length === 0 ? nothing : html`
                <div class="canvas-view-error">${problemText(
                  this._problems,
                )}</div>
              `}
              ${this._view
                ? html`<div class="canvas-view-body">
            ${renderNode(this._view, onAction)}
          </div>`
                : html`<div class="canvas-view-empty">${this.emptyMessage}</div>`}
            </div>
    `;
  }
}

if (!customElements.get("canvas-view")) {
  customElements.define("canvas-view", CanvasView);
}
