import { assertEquals } from "@std/assert";
import {
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
