import { assertEquals } from "@std/assert";
import { widgetColors } from "./design.tsx";

Deno.test("widgetColors uses custom background over default", () => {
  const result = widgetColors(true, { background: "#111827" });
  assertEquals(result.background, "#111827");
  assertEquals(result.backgroundColor, "#111827");
});

Deno.test("widgetColors uses custom background in light mode", () => {
  const result = widgetColors(false, { background: "#f9fafb" });
  assertEquals(result.background, "#f9fafb");
  assertEquals(result.backgroundColor, "#f9fafb");
});

Deno.test("widgetColors uses default pattern when no custom background", () => {
  const dark = widgetColors(true);
  assertEquals(dark.backgroundColor, "#0a0a0a");
  assertEquals(typeof dark.background, "string");

  const light = widgetColors(false);
  assertEquals(light.backgroundColor, "#f8f7f4");
});
