import { html, LitElement, nothing, type TemplateResult } from "lit";
import { unsafeStatic } from "lit/static-html.js";
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
  color: ${isDark ? "#f4f4f4" : "#222"};
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
}
.canvas-view-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 1.5rem;
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
  z-index: 2;
}
.canvas-view-toast {
  align-self: center;
  max-width: 34rem;
  padding: 0.5rem 0.9rem;
  border-radius: 999px;
  background: ${isDark ? "#262626" : "#ffffff"};
  border: 1px solid ${isDark ? "#3a3a3a" : "#e2e0da"};
  box-shadow: 0 6px 20px rgba(0,0,0,0.18);
  font-size: 0.9rem;
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
  opacity: 0.6;
  font-size: 0.9rem;
  padding: 3rem 1rem;
  text-align: center;
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

// Text only; the canvas never injects markup of its own.
const renderAttrs = (attrs: Readonly<Record<string, string>> | undefined) =>
  Object.entries(attrs ?? {})
    .filter(([key]) => key !== "class" && key.trim().length > 0)
    .map(([key, value]) =>
      html`
        ${key}="${value}"
      `
    );

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
  // validateView has already rejected anything outside the set; this guards the
  // unsafeStatic call itself, which must never see an arbitrary name.
  if (!isRenderableTag(tag)) return nothing;
  const action = node.on?.click ?? node.on?.submit;
  const className = node.attrs?.class?.split(/\s+/).filter(Boolean).join(" ") ??
    "";
  const children = (node.children ?? []).map((child) =>
    renderNode(child, onAction)
  );
  return html`
    <${unsafeStatic(tag)}
      ...=${renderAttrs(node.attrs)}
      class="canvas-el ${className}"
      data-on-${node.on?.submit ? "submit" : "click"}=${action ?? ""}
      @click=${(e: Event) => {
        const name = node.on?.click;
        if (!name) return;
        e.preventDefault();
        onAction(name, {});
      }}
      @submit=${(e: Event) => {
        const name = node.on?.submit;
        if (!name) return;
        e.preventDefault();
        onAction(name, collectFields(e.currentTarget));
      }}
    >${node.text ?? nothing}${children}</${unsafeStatic(tag)}>
  `;
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
    authorNames: { attribute: false },
  };

  credentials: Credentials | undefined;
  conversationId = "";
  isDark = false;
  emptyMessage = "Nothing here yet";
  authorNames: Readonly<Record<string, string>> = {};

  private _canvas: StoredCanvas | undefined;
  private _view: ViewElement | undefined;
  private _problems: CanvasProblem[] = [];
  private _toasts: { readonly id: string; readonly text: string }[] = [];
  private _seenMessages = 0;
  private _off: (() => void)[] = [];

  override createRenderRoot(): HTMLElement {
    return this;
  }

  override connectedCallback() {
    super.connectedCallback();
    this._watch();
  }

  override disconnectedCallback() {
    this._unsubscribe();
    super.disconnectedCallback();
  }

  override willUpdate(changed: Map<string, unknown>) {
    if (
      changed.has("conversationId") || changed.has("credentials") ||
      changed.has("_canvas")
    ) {
      this._render();
    }
  }

  private _unsubscribe() {
    this._off.forEach((off) => off());
    this._off = [];
  }

  private _watch() {
    this._unsubscribe();
    const { credentials, conversationId } = this;
    if (!credentials || !conversationId) return;
    this._off = [
      subscribeConversationKey(conversationId, credentials, (key) => {
        this._off.forEach((off) => off());
        this._off = [];
        this._seenMessages = 0;
        if (!key) return this._setCanvas(undefined);
        this._watchCanvas(key);
        this._watchMessages(key);
      }),
    ];
  }

  private _watchCanvas(key: string) {
    let lastVersion: number | undefined;
    const stop = accessDb().subscribeQuery(
      canvasQuery(this.conversationId),
      ({ data, error }) => {
        if (error) return console.error("canvas subscription failed", error);
        const row = data?.conversations[0]?.canvas;
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
    this._off.push(() => {
      stop();
      lastVersion = undefined;
    });
  }

  private _watchMessages(key: string) {
    this._off.push(
      subscribeDecryptedMessages(
        this.conversationId,
        key,
        ({ messages }) => this._onMessages(messages ?? []),
      ),
    );
  }

  private _setCanvas(canvas: StoredCanvas | undefined) {
    this._canvas = canvas;
    this._render();
  }

  private _render() {
    const body = this._canvas?.text;
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
      return;
    }
    this._view = result.view;
    this._problems = [];
  }

  private _act = (action: string, fields: Record<string, string>) => {
    const body = this._canvas?.text;
    const { credentials, conversationId } = this;
    if (!body || !credentials || !conversationId) return;
    actOnCanvas({ body, action, fields }).then((result) => {
      if (!result.ok) {
        this._problems = result.problems;
        return;
      }
      result.emitted.forEach((event: CanvasEvent) =>
        sendCanvasEvent({
          credentials,
          conversation: conversationId,
          action: event.action,
          data: event.data,
        }).catch((error) => console.error("failed to send canvas event", error))
      );
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
      <div class="canvas-view" style=${`background:${
        this.isDark ? "#0a0a0a" : "#f8f7f4"
      }`}>
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
