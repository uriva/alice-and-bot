type RejectionEventLike = {
  reason?: unknown;
  preventDefault?: unknown;
  stopImmediatePropagation?: unknown;
};

type ErrorEventLike = {
  message?: unknown;
  error?: unknown;
  preventDefault?: unknown;
  stopImmediatePropagation?: unknown;
};

type EventTargetLike = {
  addEventListener: (
    type: string,
    listener: (event: unknown) => void,
    options?: boolean | AddEventListenerOptions,
  ) => void;
};

const extractMessage = (input: unknown): string =>
  typeof input === "string"
    ? input
    : typeof input === "object" && input !== null && "message" in input &&
        typeof input.message === "string"
    ? input.message
    : "";

export const isResizeObserverError = (reasonOrEvent: unknown): boolean =>
  extractMessage(reasonOrEvent).includes("ResizeObserver");

export const isScriptError = (event: ErrorEventLike): boolean =>
  event.message === "Script error." && !event.error;

export const isExtensionHostObjectRejection = (reason: unknown): boolean =>
  extractMessage(reason).includes("Object Not Found Matching Id");

export const isNextSiblingNullError = (reasonOrEvent: unknown): boolean =>
  extractMessage(reasonOrEvent).includes(
    "Cannot read properties of null (reading 'nextSibling')",
  );

export const isEventRejection = (reason: unknown): boolean =>
  typeof Event !== "undefined" && reason instanceof Event;

export const isNullRejection = (reason: unknown): boolean =>
  reason === null || reason === undefined;

export const suppressClientErrorEvent = (event: unknown): void => {
  if (typeof event !== "object" || event === null) return;
  const e = event as ErrorEventLike;
  if (
    typeof e.preventDefault !== "function" ||
    typeof e.stopImmediatePropagation !== "function"
  ) {
    return;
  }
  if (
    !isResizeObserverError(e.message) &&
    !isResizeObserverError(e.error) &&
    !isScriptError(e) &&
    !isNextSiblingNullError(e.message) &&
    !isNextSiblingNullError(e.error)
  ) {
    return;
  }
  e.preventDefault();
  e.stopImmediatePropagation();
};

export const suppressClientRejectionEvent = (event: unknown): void => {
  if (typeof event !== "object" || event === null) return;
  const e = event as RejectionEventLike;
  if (
    typeof e.preventDefault !== "function" ||
    typeof e.stopImmediatePropagation !== "function"
  ) {
    return;
  }
  if (
    !isResizeObserverError(e.reason) &&
    !isEventRejection(e.reason) &&
    !isExtensionHostObjectRejection(e.reason) &&
    !isNextSiblingNullError(e.reason) &&
    !isNullRejection(e.reason)
  ) {
    return;
  }
  e.preventDefault();
  e.stopImmediatePropagation();
};

export const installClientErrorSuppression = (
  target: EventTargetLike,
): void => {
  target.addEventListener(
    "error",
    (event) => suppressClientErrorEvent(event),
    true,
  );
  target.addEventListener(
    "unhandledrejection",
    (event) => suppressClientRejectionEvent(event),
    true,
  );
};
