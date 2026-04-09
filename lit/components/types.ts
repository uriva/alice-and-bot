import type { Attachment } from "../../protocol/src/clientApi.ts";

export type EditHistoryEntry = {
  text: string;
  timestamp: number;
  attachments?: Attachment[];
};

export type AbstracChatMessage = {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  text: string;
  timestamp: number;
  attachments?: Attachment[];
  editHistory?: EditHistoryEntry[];
  callDetails?: { action: string; duration?: number };
};

export type ActiveStream = {
  authorAvatar?: string;
  authorPublicKey?: string;
  authorName: string;
  text: string;
  elementId: string;
  timestamp: number;
};

export type ActiveSpinner = {
  authorName: string;
  text: string;
  elementId: string;
  timestamp: number;
  active: boolean;
};

export type ActiveProgress = {
  authorName: string;
  text: string;
  percentage: number;
  elementId: string;
  timestamp: number;
};

export type TimelineEntry =
  | { kind: "message"; msg: AbstracChatMessage; prevMsg?: AbstracChatMessage }
  | { kind: "spinner"; spinner: ActiveSpinner }
  | { kind: "progress"; progress: ActiveProgress }
  | { kind: "stream"; stream: ActiveStream; prevMsg?: AbstracChatMessage };

export type CustomColors = {
  background?: string;
  text?: string;
  primary?: string;
  otherBubble?: string;
  hideTitle?: boolean;
  hideOwnAvatar?: boolean;
  hideOtherBubble?: boolean;
  hideNames?: boolean;
  inputMaxWidth?: string;
  chatMaxWidth?: string;
  inputBackground?: string;
  scrollbarColor?: string;
};

export type DiffPart = { text: string; kind: "same" | "add" | "del" };
