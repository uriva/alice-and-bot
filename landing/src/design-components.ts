import { html, type TemplateResult } from "lit";
import { isLightColor } from "../../lit/components/design.ts";
import { subscribeDarkMode } from "../../lit/core/dark-mode.ts";

export { avatarColor } from "../../lit/components/design.ts";

let currentDark = false;
subscribeDarkMode((d) => (currentDark = d));

const avatarContainerStyle = (baseColor: string) =>
  `display:flex;align-items:center;justify-content:center;flex-shrink:0;width:32px;height:32px;padding:4px;border-radius:50%;background:${baseColor};box-shadow:${
    currentDark ? "0 1px 4px #0004" : "0 1px 4px #0001"
  };transition:background 0.2s,box-shadow 0.2s`;

const initialsColor = (baseColor: string) =>
  isLightColor(baseColor) ? (currentDark ? "#fff" : "#222") : "#fff";

export const chatAvatar = (
  { image, name, baseColor }: {
    image?: string;
    name: string | null;
    baseColor: string;
  },
): TemplateResult =>
  html`
    <div style="${avatarContainerStyle(baseColor)}">
      ${image
        ? html`
          <img
            src="${image}"
            alt="${name ?? ""}"
            style="object-fit:cover;border-radius:50%"
          />
        `
        : html`
          <span
            style="color:${initialsColor(
              baseColor,
            )};font-weight:700;font-size:15px;letter-spacing:0.5px"
          >${(name ?? "").slice(0, 2).toUpperCase()}</span>
        `}
    </div>
  `;

const spinnerKeyframes = "spin";

export const spinner = (color?: string): TemplateResult => {
  const border = `4px solid ${currentDark ? "#ffffff1a" : "#00000010"}`;
  const borderTop = `4px solid ${
    color ?? (currentDark ? "#ffffff80" : "#00000040")
  }`;
  return html`
    <style>
    @keyframes ${spinnerKeyframes} { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    </style>
    <div
      style="width:40px;height:40px;border:${border};border-top:${borderTop};border-radius:50%;animation:spin 1s linear infinite"
    >
    </div>
  `;
};

const shimmerKeyframes = "shimmer";

const shimmerGradient = () =>
  currentDark
    ? "linear-gradient(90deg, #333 25%, #444 50%, #333 75%)"
    : "linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%)";

const shimmerStyle = (width: number, height: number, borderRadius = "4px") =>
  `display:inline-block;border-radius:${borderRadius};background:${shimmerGradient()};background-size:200% 100%;animation:shimmer 1.5s ease-in-out infinite;width:${width}px;height:${height}px`;

const shimmerStyleTag = html`
  <style>
  @keyframes ${shimmerKeyframes} { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
  </style>
`;

export const shimmerText = (width = 80, height = 14): TemplateResult =>
  html`
    ${shimmerStyleTag}<span style="${shimmerStyle(width, height)}"></span>
  `;

export const shimmerCircle = (size = 32): TemplateResult =>
  html`
    ${shimmerStyleTag}<span style="${shimmerStyle(size, size, "50%")}"></span>
  `;
