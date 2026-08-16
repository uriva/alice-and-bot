import { assertEquals } from "@std/assert";
import {
  isBrowserExtensionError,
  isEventRejection,
  isMediaOrNetworkAbortError,
  isResizeObserverError,
  suppressClientErrorEvent,
  suppressClientRejectionEvent,
} from "./suppressClientErrors.ts";

Deno.test("isResizeObserverError identifies ResizeObserver loop errors", () => {
  assertEquals(
    isResizeObserverError(
      "ResizeObserver loop completed with undelivered notifications.",
    ),
    true,
  );
  assertEquals(
    isResizeObserverError("ResizeObserver loop limit exceeded"),
    true,
  );
  assertEquals(
    isResizeObserverError(
      new Error(
        "ResizeObserver loop completed with undelivered notifications.",
      ),
    ),
    true,
  );
  assertEquals(
    isResizeObserverError("Uncaught TypeError: Failed to fetch"),
    false,
  );
});

Deno.test("suppressClientErrorEvent stops propagation on ResizeObserver errors", () => {
  let stopped = false;
  let prevented = false;

  const mockEvent = {
    message: "ResizeObserver loop completed with undelivered notifications.",
    error: null,
    preventDefault: () => {
      prevented = true;
    },
    stopImmediatePropagation: () => {
      stopped = true;
    },
  };

  suppressClientErrorEvent(mockEvent);

  assertEquals(prevented, true);
  assertEquals(stopped, true);
});

Deno.test("suppressClientErrorEvent leaves real errors untouched", () => {
  let stopped = false;
  let prevented = false;

  const mockEvent = {
    message: "Uncaught Error: Something real failed",
    error: new Error("Something real failed"),
    preventDefault: () => {
      prevented = true;
    },
    stopImmediatePropagation: () => {
      stopped = true;
    },
  };

  suppressClientErrorEvent(mockEvent);

  assertEquals(prevented, false);
  assertEquals(stopped, false);
});

Deno.test("isEventRejection matches raw DOM events, DOMExceptions, and storage event objects", () => {
  assertEquals(isEventRejection(new Event("error")), true);
  assertEquals(isEventRejection(new Event("close")), true);
  assertEquals(
    isEventRejection(new DOMException("q", "QuotaExceededError")),
    true,
  );
  assertEquals(isEventRejection({ isTrusted: false }), true);
  assertEquals(isEventRejection({ isTrusted: true }), true);
  assertEquals(
    isEventRejection({
      message:
        "NotFoundError: Failed to execute 'transaction' on 'IDBDatabase': One of the specified object stores was not found.",
    }),
    true,
  );
  assertEquals(isEventRejection(new Error("boom")), false);
  assertEquals(isEventRejection(null), false);
  assertEquals(isEventRejection(undefined), false);
  assertEquals(isEventRejection("Load failed"), false);
});

Deno.test("suppressClientRejectionEvent swallows InstantDB raw Event rejections", () => {
  let stopped = false;
  let prevented = false;

  const mockEvent = {
    reason: new Event("error"),
    preventDefault: () => {
      prevented = true;
    },
    stopImmediatePropagation: () => {
      stopped = true;
    },
  };

  suppressClientRejectionEvent(mockEvent);

  assertEquals(prevented, true);
  assertEquals(stopped, true);
});

Deno.test("isBrowserExtensionError identifies extension URLs and disconnect messages", () => {
  assertEquals(
    isBrowserExtensionError(
      new Error("chrome-extension://abcdef/script.js: failed"),
    ),
    true,
  );
  assertEquals(
    isBrowserExtensionError(
      "The message port closed before a response was received.",
    ),
    true,
  );
  assertEquals(
    isBrowserExtensionError(
      "A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received",
    ),
    true,
  );
  assertEquals(
    isBrowserExtensionError(
      "Could not establish connection. Receiving end does not exist.",
    ),
    true,
  );
  assertEquals(
    isBrowserExtensionError("Extension context invalidated."),
    true,
  );
  assertEquals(
    isBrowserExtensionError(new Error("Something real failed")),
    false,
  );
});

Deno.test("isMediaOrNetworkAbortError identifies media and abort rejections", () => {
  assertEquals(
    isMediaOrNetworkAbortError(
      "The play() request was interrupted by a call to pause().",
    ),
    true,
  );
  assertEquals(
    isMediaOrNetworkAbortError(
      "play() failed because the user didn't interact with the document first.",
    ),
    true,
  );
  assertEquals(
    isMediaOrNetworkAbortError("The operation was aborted"),
    true,
  );
  assertEquals(
    isMediaOrNetworkAbortError(new Error("The user aborted a request.")),
    true,
  );
  assertEquals(
    isMediaOrNetworkAbortError(new Error("Something real failed")),
    false,
  );
});

Deno.test("suppressClientRejectionEvent swallows extension and media abort rejections", () => {
  let stopped = false;
  let prevented = false;

  const mockEvent = {
    reason: new Error(
      "The message port closed before a response was received.",
    ),
    preventDefault: () => {
      prevented = true;
    },
    stopImmediatePropagation: () => {
      stopped = true;
    },
  };

  suppressClientRejectionEvent(mockEvent);

  assertEquals(prevented, true);
  assertEquals(stopped, true);
});
