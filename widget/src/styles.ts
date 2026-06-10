import type { WidgetModeColors } from "./widget.ts";

export type { WidgetModeColors };

export type WidgetMode = "light" | "dark";

export const closeButtonCss = (
  { colors }: { colors: WidgetModeColors },
) =>
  `position:absolute;top:8px;right:8px;width:28px;height:28px;border-radius:14px;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:10`;

export const dialogBoxCss = (
  { colors, mode }: { colors: WidgetModeColors; mode: WidgetMode },
) =>
  `background:${colors.surface};color:${colors.text};min-width:260px;max-width:320px;border-radius:16px;border:1px solid ${
    mode === "dark" ? "#2a2a2a" : "#e5e7eb"
  };box-shadow:${
    mode === "dark" ? "0 8px 24px #0008" : "0 8px 24px #0002"
  };padding:24px;display:flex;flex-direction:column;align-items:center;gap:16px`;

export const fieldCss = (colors: WidgetModeColors) =>
  `width:100%;max-width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid ${colors.inputBorder};background:${colors.inputBackground};color:${colors.inputText};outline:none`;

export const buttonNeutralCss = (colors: WidgetModeColors) =>
  `background:${colors.neutralBg};color:${colors.neutralText};border:none;border-radius:8px;padding:8px 12px;cursor:pointer`;

export const buttonPrimaryCss = (colors: WidgetModeColors) =>
  `background:${colors.primary};color:${colors.primaryText};border:none;border-radius:8px;padding:8px 12px;cursor:pointer`;
