import { assertEquals } from "@std/assert";
import {
  isPast,
  latestTimestamp,
  standaloneSpinnerEntries,
} from "./transient-elements.ts";

Deno.test("standaloneSpinnerEntries excludes stale active spinners older than current message timeline", () => {
  const staleSpinner = {
    elementId: "spinner-old",
    type: "spinner",
    text: "old spinner",
    active: true,
    updatedAt: 100,
  };
  const freshSpinner = {
    elementId: "spinner-fresh",
    type: "spinner",
    text: "fresh spinner",
    active: true,
    updatedAt: 1001,
  };
  const result = standaloneSpinnerEntries(
    [staleSpinner, freshSpinner],
    new Set<string>(),
    1000,
  );
  assertEquals(result.map(({ elementId }) => elementId), ["spinner-fresh"]);
});

Deno.test("latestTimestamp returns zero for empty list", () => {
  assertEquals(latestTimestamp([]), 0);
});

Deno.test("isPast returns true if there is any subsequent text/edit message", () => {
  const messages = [
    { id: "m1", text: "hello", timestamp: 1000, type: "text" },
    { id: "m2", text: "Thinking...", timestamp: 1050, type: "spinner" },
    { id: "m3", text: "world", timestamp: 1100, type: "text" },
  ] as any[];

  assertEquals(isPast(1000, messages), true);  // Succeeded by "world" at 1100
  assertEquals(isPast(1050, messages), true);  // Succeeded by "world" at 1100
  assertEquals(isPast(1100, messages), false); // No subsequent text/edit message
});
