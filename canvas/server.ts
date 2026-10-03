// The server-side canvas surface. Deliberately separate from mod.ts: the
// runtime interprets Safescript, so re-exporting it from the main entrypoint
// would pull the interpreter into every browser bundle that imports anything
// from the package.
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
