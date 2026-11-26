/**
 * Server-side encrypted interactive canvas runtime and storage helpers for
 * Alice&Bot.
 *
 * Deliberately separate from `mod.ts` so browser bundles do not pull in the
 * Safescript interpreter.
 *
 * @module
 */
export {
  applyEdit,
  type CanvasEdit,
  maxCanvasLength,
  type PatchOutcome,
} from "./patch.ts";
export {
  actOnCanvas,
  type CanvasAction,
  type CanvasEvent,
  type CanvasProblem,
  type CanvasRender,
  maxCanvasRuntimeMs,
  renderCanvas,
} from "./runtime.ts";
export { canvasPrelude } from "./prelude.ts";
export {
  isRenderableTag,
  renderableTags,
  validateView,
  type ViewElement,
  type ViewNode,
  viewText,
} from "./view.ts";
export {
  type CanvasRead,
  type CanvasWrite,
  createCanvas,
  emptyCanvas,
  readCanvas,
  type StoredCanvas,
  writeCanvas,
} from "./store.ts";
