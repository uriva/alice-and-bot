import { assertEquals } from "@std/assert";
import {
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
