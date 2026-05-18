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

Deno.test("widget close button is flat — no box-shadow", () => {
  const css = closeButtonCss({ colors: dummyColors });
  assertNotMatch(css, /box-shadow/);
});

Deno.test("widget name dialog uses rounded centered popup style", () => {
  const css = dialogBoxCss({ colors: dummyColors, mode: "light" });
  assertMatch(css, /border-radius:16px/);
  assertMatch(css, /min-width:260px/);
  assertMatch(css, /max-width:320px/);
  assertMatch(css, /align-items:center/);
  assertMatch(css, /padding:24px/);
});
