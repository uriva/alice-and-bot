type RejectionEventLike = {
  reason?: unknown;
  preventDefault?: unknown;
  stopImmediatePropagation?: unknown;
};

type ErrorEventLike = {
  message?: unknown;
  error?: unknown;
  filename?: unknown;
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

const isRecord = (val: unknown): val is Record<string, unknown> =>
  typeof val === "object" && val !== null;

const extractMessage = (input: unknown): string =>
  typeof input === "string"
    ? input
    : isRecord(input) && typeof input.message === "string"
    ? input.message
    : "";

const extensionPrefixes = [
  "chrome-extension://",
  "moz-extension://",
  "safari-extension://",
  "safari-web-extension://",
  "ms-browser-extension://",
  "extension://",
  "webkit-masked-url://",
  "user-script:",
];

const extensionMessages = [
  "Object Not Found Matching Id",
  "The message port closed before a response was received",
  "message channel closed before a response was received",
  "Could not establish connection. Receiving end does not exist",
  "Extension context invalidated",
  "Invalid call to runtime.sendMessage()",
  "No Listener: tabs:",
  "Can't find variable: EmptyRanges",
  'Policy with name "default" already exists',
  "The provider is disconnected from all chains",
  "Failed to connect to MetaMask",
];

const abortMessages = [
  "The play() request was interrupted",
  "play() failed because the user didn't interact",
  "The operation was aborted",
  "Fetch is aborted",
  "The user aborted a request",
  "AbortError",
  "Failed to fetch",
  "Load failed",
  "NetworkError when attempting to fetch resource",
];

const translationMessages = [
  "String contained an illegal UTF-16 sequence",
];

const translationKeywords = [
  "translate",
];

const scriptExtensions = [
  ".js",
  ".mjs",
  ".ts",
  ".tsx",
];

const litDomMethods = [
  "nextSibling",
  "insertBefore",
  "removeChild",
  "parentNode",
  "firstChild",
  "setting 'data'",
];

const hasScriptExtension = (text: string): boolean =>
  scriptExtensions.some((ext) => text.includes(ext));

const extractStrings = (input: unknown): string[] => {
  if (typeof input === "string") return [input];
  if (!isRecord(input)) return [];
  return ["message", "stack", "filename", "fileName", "sourceURL", "name"]
    .map((k) => input[k])
    .filter((v): v is string => typeof v === "string");
};

const extractEventStrings = (event: unknown): string[] =>
  isRecord(event)
    ? [...extractStrings(event.error), ...extractStrings(event)]
    : extractStrings(event);

export const isBrowserExtensionError = (reasonOrEvent: unknown): boolean =>
  extractStrings(reasonOrEvent).some(
    (str) =>
      extensionPrefixes.some((prefix) => str.includes(prefix)) ||
      extensionMessages.some((msg) => str.includes(msg)),
  );

export const isMediaOrNetworkAbortError = (reasonOrEvent: unknown): boolean =>
  extractStrings(reasonOrEvent).some((str) =>
    abortMessages.some((msg) => str.includes(msg))
  );

export const isResizeObserverError = (reasonOrEvent: unknown): boolean =>
  extractMessage(reasonOrEvent).includes("ResizeObserver");

export const isScriptError = (event: ErrorEventLike): boolean =>
  event.message === "Script error." && !event.error;

export const isExtensionHostObjectRejection = (reason: unknown): boolean =>
  isBrowserExtensionError(reason);

const matchesNextSiblingNullStrings = (strings: string[]): boolean => {
  const combined = strings.join("\n");
  return (
    litDomMethods.some((method) => combined.includes(method)) &&
    (combined.includes("null") || combined.includes("undefined"))
  );
};

export const isNextSiblingNullError = (reasonOrEvent: unknown): boolean =>
  matchesNextSiblingNullStrings(extractEventStrings(reasonOrEvent));

const matchesTranslationStrings = (strings: string[]): boolean => {
  const combined = strings.join("\n");
  const isInlineInjectedCallStackOverflow =
    combined.includes("Maximum call stack size exceeded") &&
    (combined.includes("http://") || combined.includes("https://")) &&
    !hasScriptExtension(combined);
  return (
    isInlineInjectedCallStackOverflow ||
    strings.some(
      (str) =>
        translationMessages.some((msg) => str.includes(msg)) ||
        (translationKeywords.some((kw) => str.includes(kw)) &&
          (str.includes("encodeURIComponent") ||
            str.includes("URI malformed") ||
            str.includes("URIError"))),
    )
  );
};

export const isBrowserTranslationError = (reasonOrEvent: unknown): boolean =>
  matchesTranslationStrings(extractEventStrings(reasonOrEvent));

const constructorName = (obj: Record<string, unknown>): string =>
  typeof obj.constructor === "function" ? obj.constructor.name : "";

export const isEventRejection = (reason: unknown): boolean => {
  if (!isRecord(reason)) return false;
  if (typeof Event !== "undefined" && reason instanceof Event) return true;
  if (typeof DOMException !== "undefined" && reason instanceof DOMException) {
    return true;
  }
  const tag = Object.prototype.toString.call(reason);
  if (tag.endsWith("Event]") || tag === "[object DOMException]") return true;
  const name = constructorName(reason);
  if (name === "Event" || name.endsWith("Event") || name === "DOMException") {
    return true;
  }
  if (typeof reason.isTrusted === "boolean") return true;
  if (
    typeof reason.message === "string" && reason.message.includes("IDBDatabase")
  ) {
    return true;
  }
  return false;
};

export const isNullRejection = (reason: unknown): boolean =>
  reason === null || reason === undefined;

const isErrorEventLike = (event: unknown): event is ErrorEventLike =>
  isRecord(event);

const isRejectionEventLike = (event: unknown): event is RejectionEventLike =>
  isRecord(event);

export const suppressClientErrorEvent = (event: unknown): void => {
  if (!isErrorEventLike(event)) return;
  if (
    typeof event.preventDefault !== "function" ||
    typeof event.stopImmediatePropagation !== "function"
  ) {
    return;
  }
  if (
    !isResizeObserverError(event.message) &&
    !isResizeObserverError(event.error) &&
    !isScriptError(event) &&
    !isNextSiblingNullError(event) &&
    !isBrowserExtensionError(event.message) &&
    !isBrowserExtensionError(event.error) &&
    !isBrowserExtensionError(event.filename) &&
    !isMediaOrNetworkAbortError(event.message) &&
    !isMediaOrNetworkAbortError(event.error) &&
    !isBrowserTranslationError(event)
  ) {
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
};

export const suppressClientRejectionEvent = (event: unknown): void => {
  if (!isRejectionEventLike(event)) return;
  if (
    typeof event.preventDefault !== "function" ||
    typeof event.stopImmediatePropagation !== "function"
  ) {
    return;
  }
  if (
    !isResizeObserverError(event.reason) &&
    !isEventRejection(event.reason) &&
    !isBrowserExtensionError(event.reason) &&
    !isNextSiblingNullError(event.reason) &&
    !isMediaOrNetworkAbortError(event.reason) &&
    !isBrowserTranslationError(event.reason) &&
    !isNullRejection(event.reason)
  ) {
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
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
