import type { WidgetModeColors } from "./widget.ts";

export type { WidgetModeColors };

export type WidgetMode = "light" | "dark";

export const closeButtonCss = (
  { colors }: { colors: WidgetModeColors },
) =>
  `position:absolute;top:8px;right:8px;width:32px;height:32px;border-radius:16px;border:none;background:${colors.inputBackground};color:${colors.inputText};cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:1`;
