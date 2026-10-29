import { assertEquals } from "@std/assert";
import {
  isBrowserExtensionError,
  isBrowserTranslationError,
  isEventRejection,
  isMediaOrNetworkAbortError,
  isNextSiblingNullError,
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

Deno.test("isNextSiblingNullError matches lit-html DOM mutation errors across browsers", () => {
  assertEquals(
    isNextSiblingNullError(
      new TypeError("Cannot read properties of null (reading 'nextSibling')"),
    ),
    true,
  );
  assertEquals(
    isNextSiblingNullError(
      new TypeError(
        "Cannot read properties of undefined (reading 'nextSibling')",
      ),
    ),
    true,
  );
  assertEquals(
    isNextSiblingNullError(
      new TypeError("Cannot read properties of null (reading 'insertBefore')"),
    ),
    true,
  );
  assertEquals(
    isNextSiblingNullError(
      new TypeError(
        "Cannot read properties of undefined (reading 'removeChild')",
      ),
    ),
    true,
  );
  assertEquals(
    isNextSiblingNullError(
      new TypeError("Cannot read properties of null (reading 'parentNode')"),
    ),
    true,
  );
  assertEquals(
    isNextSiblingNullError(
      new TypeError("Cannot read properties of null (reading 'firstChild')"),
    ),
    true,
  );
  assertEquals(
    isNextSiblingNullError(
      new TypeError("Cannot set properties of null (setting 'data')"),
    ),
    true,
  );
  assertEquals(
    isNextSiblingNullError(
      new TypeError("Cannot set properties of undefined (setting 'data')"),
    ),
    true,
  );
  assertEquals(
    isNextSiblingNullError(
      new TypeError(
        "null is not an object (evaluating 'this._$AA.nextSibling.data=e')",
      ),
    ),
    true,
  );
  assertEquals(
    isNextSiblingNullError(
      new TypeError("null is not an object (evaluating 't.insertBefore(e,r)')"),
    ),
    true,
  );
  const firefoxIosErr = new TypeError(
    "undefined is not an object (evaluating 's[e]')",
  );
  firefoxIosErr.stack =
    "insertBefore@[native code]\nglobal code@https://aliceandbot.com/chat:1:4515";
  assertEquals(isNextSiblingNullError(firefoxIosErr), true);
  assertEquals(isNextSiblingNullError(new Error("Other error")), false);
  assertEquals(isNextSiblingNullError(null), false);
});

Deno.test("isBrowserTranslationError matches UTF-16 surrogate URIErrors, translate stacks, and inline call stack overflows", () => {
  const webKitErr = new URIError(
    "String contained an illegal UTF-16 sequence.",
  );
  webKitErr.stack =
    "?@https://aliceandbot.com/chat:843:22039\ntranslate@https://aliceandbot.com/chat:843:40210\nencodeURIComponent@[native code]";
  assertEquals(isBrowserTranslationError(webKitErr), true);

  const chromeErr = new URIError("URI malformed");
  chromeErr.stack =
    "URIError: URI malformed\n    at encodeURIComponent (<anonymous>)\n    at translate (https://aliceandbot.com/chat:843:40210)";
  assertEquals(isBrowserTranslationError(chromeErr), true);

  const chromeIosTranslateStackOverflow = new RangeError(
    "Maximum call stack size exceeded.",
  );
  chromeIosTranslateStackOverflow.stack =
    "@https://aliceandbot.com/chat:189:70\n@https://aliceandbot.com/chat:196:363";
  assertEquals(
    isBrowserTranslationError(chromeIosTranslateStackOverflow),
    true,
  );

  const realAppStackOverflow = new RangeError(
    "Maximum call stack size exceeded",
  );
  realAppStackOverflow.stack =
    "RangeError: Maximum call stack size exceeded\n    at foo (https://aliceandbot.com/assets/index-CNy70vr5.js:10:20)";
  assertEquals(isBrowserTranslationError(realAppStackOverflow), false);
  assertEquals(isBrowserTranslationError(new Error("standard error")), false);
});

Deno.test("suppressClientRejectionEvent swallows browser translation, lit-html setting 'data', and Web3 provider rejections", () => {
  const assertSuppressed = (reason: unknown) => {
    let stopped = false;
    let prevented = false;
    suppressClientRejectionEvent({
      reason,
      preventDefault: () => {
        prevented = true;
      },
      stopImmediatePropagation: () => {
        stopped = true;
      },
    });
    assertEquals(prevented, true);
    assertEquals(stopped, true);
  };

  assertSuppressed(
    new URIError("String contained an illegal UTF-16 sequence."),
  );
  assertSuppressed(
    new TypeError("Cannot set properties of null (setting 'data')"),
  );
  assertSuppressed(new Error("The provider is disconnected from all chains."));
  assertSuppressed({ name: "AbortError", message: "aborted" });
});
