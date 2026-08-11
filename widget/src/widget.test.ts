if (
  typeof (globalThis as unknown as { Element: unknown }).Element === "undefined"
) {
  class DummyElement {}
  (DummyElement.prototype as unknown as Record<string, unknown>)
    .replaceChildren = () => {};
  (globalThis as unknown as { Element: unknown }).Element = DummyElement;
  (globalThis as unknown as { HTMLElement: unknown }).HTMLElement =
    DummyElement;
  (globalThis as unknown as { customElements: unknown }).customElements = {
    get: () => {},
    define: () => {},
  };
}
if (
  typeof (globalThis as unknown as { requestAnimationFrame: unknown })
    .requestAnimationFrame === "undefined"
) {
  (globalThis as unknown as { requestAnimationFrame: unknown })
    .requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(cb, 16);
}

import { assertMatch, assertNotMatch } from "@std/assert";
import { closeButtonCss, dialogBoxCss } from "./styles.ts";

const dummyColors = {
  background: "#fff",
  text: "#000",
  surface: "#fff",
  border: "#e5e7eb",
  overlay: "rgba(0,0,0,0.5)",
  primary: "#3b82f6",
  primaryText: "#fff",
  neutralBg: "#f3f4f6",
  neutralText: "#374151",
  startButton: "#3b82f6",
  startButtonText: "#fff",
  startShadow: "rgba(0,0,0,0.2)",
  inputBackground: "#fff",
  inputText: "#000",
  inputBorder: "#e5e7eb",
} as const;

Deno.test("widget container has smooth open animation when opened on desktop", async () => {
  const { containerCss } = await import("./widget.ts");
  const css = containerCss({
    isMobile: false,
    isDark: false,
    isOpen: true,
  });
  assertMatch(css, /animation:\s*widget-open/);
  assertMatch(css, /transform-origin:\s*bottom right/);
});

Deno.test("widget container has slide open animation when opened on mobile", async () => {
  const { containerCss } = await import("./widget.ts");
  const css = containerCss({
    isMobile: true,
    isDark: false,
    isOpen: true,
  });
  assertMatch(css, /animation:\s*widget-mobile-open/);
});

Deno.test("widgetBaseCss contains keyframe animations for widget open", async () => {
  const { widgetBaseCss } = await import("./widget.ts");
  const css = widgetBaseCss({
    colorScheme: "light",
    headerColor: "#000",
    hoverBg: "rgba(0,0,0,0.1)",
  });
  assertMatch(css, /@keyframes widget-open/);
  assertMatch(css, /@keyframes widget-mobile-open/);
  assertMatch(css, /@keyframes widget-dialog-open/);
});

Deno.test("widget close button is flat — no box-shadow", () => {
  const css = closeButtonCss({ colors: dummyColors });
  assertNotMatch(css, /box-shadow/);
});

Deno.test("widget close button top position is 8px for vertical alignment", () => {
  const css = closeButtonCss({ colors: dummyColors });
  assertMatch(css, /top:8px/);
});

Deno.test("widget name dialog uses rounded centered popup style", () => {
  const css = dialogBoxCss({ colors: dummyColors, mode: "light" });
  assertMatch(css, /border-radius:16px/);
  assertMatch(css, /min-width:260px/);
  assertMatch(css, /max-width:320px/);
  assertMatch(css, /align-items:center/);
  assertMatch(css, /padding:24px/);
});

Deno.test("chat-box title-bar inner padding-right is beautiful and dynamic to avoid overlap and align perfectly with absolute close button", () => {
  const code = Deno.readTextFileSync(
    new URL("../../lit/components/chat-box.ts", import.meta.url),
  );
  const match = code.match(
    /padding:0\s+\$\{\s*this\s*\.\s*onClose\s+\?\s*"16px"\s*:\s*"44px"\s*\}\s+0\s+16px/,
  );
  if (!match) {
    throw new Error(
      "Could not find beautiful dynamic title-bar padding in chat-box.ts",
    );
  }
});
