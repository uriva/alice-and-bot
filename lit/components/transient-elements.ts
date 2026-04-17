import type { DecipheredMessage } from "../../protocol/src/clientApi.ts";
import type { ActiveSpinner } from "./types.ts";

type UiElement = {
  elementId: string;
  active?: boolean;
  text?: string;
  type?: string;
  updatedAt: number;
};

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

export const latestTimestamp = (messages: DecipheredMessage[]): number =>
  messages.reduce(
    (maxTimestamp, message) => Math.max(maxTimestamp, message.timestamp),
    0,
  );
