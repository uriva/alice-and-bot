import { assertEquals } from "@std/assert";

const computeHasCanvas = (canvas: unknown): boolean =>
  Boolean(
    canvas &&
      (Array.isArray(canvas) ? canvas.length > 0 : true),
  );

Deno.test("computeHasCanvas returns false for empty array from InstantDB query", () => {
  assertEquals(computeHasCanvas([]), false);
});

Deno.test("computeHasCanvas returns false for undefined", () => {
  assertEquals(computeHasCanvas(undefined), false);
});

Deno.test("computeHasCanvas returns true for array containing canvas row", () => {
  assertEquals(computeHasCanvas([{ id: "c-1", version: 1 }]), true);
});

Deno.test("computeHasCanvas returns true for single canvas object", () => {
  assertEquals(computeHasCanvas({ id: "c-1", version: 1 }), true);
});
