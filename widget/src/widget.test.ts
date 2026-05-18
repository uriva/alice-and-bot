import { assertNotMatch } from "@std/assert";
import { closeButtonCss } from "./styles.ts";

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
