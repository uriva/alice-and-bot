import type { ActiveSpinner } from "./types.ts";

type TimelineMessage = { timestamp: number; type: string };

type UiElement = {
  elementId: string;
  active?: boolean;
  text?: string;
  type?: string;
  updatedAt: number;
};

export const isPast = (timestamp: number, messages: TimelineMessage[]) =>
  messages.some((m) =>
    m.timestamp > timestamp && (m.type === "text" || m.type === "edit")
  );

export const standaloneSpinnerEntries = (
  uiElements: UiElement[],
  knownIds: Set<string>,
  minUpdatedAt: number,
): ActiveSpinner[] =>
  uiElements
    .filter((el) =>
      el.type === "spinner" && !knownIds.has(el.elementId) &&
      el.active !== false && el.updatedAt >= minUpdatedAt
    )
    .map((el) => ({
      authorName: "",
      text: el.text ?? "",
      elementId: el.elementId,
      timestamp: el.updatedAt,
      active: el.active !== false,
    }));

export const latestTimestamp = (messages: TimelineMessage[]): number =>
  messages.reduce(
    (maxTimestamp, message) => Math.max(maxTimestamp, message.timestamp),
    0,
  );
