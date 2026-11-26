import type { AbstracChatMessage } from "./types.ts";
import { editWindowMs } from "./utils.ts";

export type ShortcutDirection = "prev" | "next";

export type GlobalShortcutAction =
  | { type: "prev-thread" }
  | { type: "next-thread" }
  | { type: "focus-search" }
  | { type: "toggle-shortcuts-help" };

export type ShortcutKeyEvent = {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  target?: EventTarget | null;
};

export type ShortcutHelpItem = {
  keys: readonly string[];
  label: string;
};

export type ShortcutHelpGroup = {
  title: string;
  items: readonly ShortcutHelpItem[];
};

export const isMacPlatform = (): boolean =>
  typeof navigator !== "undefined" &&
  /Mac|iPod|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || "");

export const isTextInputTarget = (target: EventTarget | null): boolean => {
  if (!target || typeof target !== "object") return false;
  if ("isContentEditable" in target && target.isContentEditable === true) {
    return true;
  }
  const tagName = "tagName" in target && typeof target.tagName === "string"
    ? target.tagName.toUpperCase()
    : "";
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
};

export const isGlobalChord = (e: ShortcutKeyEvent): boolean => {
  const key = e.key.toLowerCase();
  const hasMod = e.ctrlKey || e.metaKey;
  if (
    e.altKey && !hasMod && !e.shiftKey &&
    (e.key === "ArrowUp" || e.key === "ArrowDown")
  ) {
    return true;
  }
  if (hasMod && !e.altKey && !e.shiftKey && key === "k") return true;
  if (hasMod && !e.altKey && key === "/") return true;
  return false;
};

export const classifyGlobalShortcut = (
  e: ShortcutKeyEvent,
): GlobalShortcutAction | null => {
  const key = e.key.toLowerCase();
  const hasMod = e.ctrlKey || e.metaKey;
  if (e.altKey && !hasMod && !e.shiftKey) {
    if (e.key === "ArrowUp") return { type: "prev-thread" };
    if (e.key === "ArrowDown") return { type: "next-thread" };
  }
  if (hasMod && !e.altKey && !e.shiftKey && key === "k") {
    return { type: "focus-search" };
  }
  if (hasMod && !e.altKey && key === "/") {
    return { type: "toggle-shortcuts-help" };
  }
  if (
    e.key === "?" && !hasMod && !e.altKey &&
    !isTextInputTarget(e.target ?? null)
  ) {
    return { type: "toggle-shortcuts-help" };
  }
  return null;
};

export const nextThreadId = (
  ids: readonly string[],
  currentId: string | null,
  direction: ShortcutDirection,
): string | null => {
  if (ids.length === 0) return null;
  const currentIndex = currentId ? ids.indexOf(currentId) : -1;
  if (currentIndex === -1) {
    return direction === "next" ? ids[0] : ids[ids.length - 1];
  }
  const delta = direction === "next" ? 1 : -1;
  return ids[(currentIndex + delta + ids.length) % ids.length];
};

export const findLastEditableMessageId = (
  messages: readonly AbstracChatMessage[],
  userId: string,
  now: number,
): string | null =>
  [...messages]
    .reverse()
    .find(
      (m) => m.authorId === userId && now - m.timestamp < editWindowMs,
    )?.id ?? null;

export const stepSelectedMessageId = (
  messages: readonly AbstracChatMessage[],
  selectedId: string | null,
  direction: ShortcutDirection,
): string | null => {
  if (messages.length === 0) return null;
  if (!selectedId) {
    return direction === "prev" ? messages[messages.length - 1].id : null;
  }
  const idx = messages.findIndex((m) => m.id === selectedId);
  if (idx === -1) return messages[messages.length - 1].id;
  if (direction === "prev") {
    return messages[Math.max(0, idx - 1)].id;
  }
  return idx >= messages.length - 1 ? null : messages[idx + 1].id;
};

export const shortcutHelpGroups = (
  isMac: boolean,
): readonly ShortcutHelpGroup[] => {
  const mod = isMac ? "⌘" : "Ctrl";
  const alt = isMac ? "⌥" : "Alt";
  return [
    {
      title: "Threads & Navigation",
      items: [
        { keys: [alt, "↑"], label: "Previous thread" },
        { keys: [alt, "↓"], label: "Next thread" },
        { keys: [mod, "K"], label: "Search & jump to thread" },
        { keys: [mod, "/"], label: "Toggle keyboard shortcuts" },
        { keys: ["Esc"], label: "Dismiss popup or close chat" },
      ],
    },
    {
      title: "Emoji & Reactions",
      items: [
        { keys: [":+1"], label: "Emoji autocomplete (Tab / Enter)" },
        { keys: [":+1:"], label: "Insert emoji inline" },
        { keys: ["+:+1:"], label: "React to previous message" },
        { keys: ["-:+1:"], label: "Remove reaction from previous message" },
      ],
    },
    {
      title: "Previous Messages",
      items: [
        { keys: ["↑"], label: "Edit your last message (empty box)" },
        { keys: [mod, "↑"], label: "Select previous message" },
        { keys: ["1", "–", "5"], label: "Quick react on selected message" },
        { keys: ["+"], label: "Open emoji picker on selected message" },
        { keys: ["R"], label: "Reply to selected message" },
        { keys: ["E"], label: "Edit selected message" },
      ],
    },
  ];
};
