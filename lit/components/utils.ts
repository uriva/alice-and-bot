/// <reference lib="dom" />
import { empty, sortKey } from "@uri/gamla";
import type {
  AbstracChatMessage,
  ActiveProgress,
  ActiveSpinner,
  ActiveStream,
  DiffPart,
  EditHistoryEntry,
  TimelineEntry,
} from "./types.ts";

export const recordingMimeType = typeof MediaRecorder !== "undefined" &&
    MediaRecorder.isTypeSupported("audio/webm")
  ? "audio/webm"
  : "audio/mp4";

export const recordingExtension = recordingMimeType === "audio/webm"
  ? "webm"
  : "m4a";

export const isVideoUrl = (href?: string) =>
  !!href && /\.(mp4|webm|ogg|m4v|mov)(\?.*)?$/i.test(href);

export const isAudioUrl = (href?: string) =>
  !!href && /\.(mp3|wav|ogg|m4a|flac)(\?.*)?$/i.test(href);

export const isHttpUrl = (src: string) => /^https?:\/\//i.test(src);

const extractMediaSrc = (tag: string) =>
  /\ssrc=["']([^"']+)["']/i.exec(tag)?.[1] ?? "";

const htmlImgToMarkdown = (text: string) =>
  text.replace(/<img\s+[^>]*>/gi, (tag) => {
    const src = /\ssrc=["']([^"']+)["']/i.exec(tag)?.[1] ?? "";
    if (!isHttpUrl(src)) return tag;
    const alt = /\salt=["']([^"']*)["']/i.exec(tag)?.[1] ?? "";
    return `![${alt}](${src})`;
  });

const htmlVideoToMarkdown = (text: string) =>
  text.replace(
    /<video[^>]*>[\s\S]*?<\/video>/gi,
    (block) => {
      const src = extractMediaSrc(block) ||
        (/\ssrc=["']([^"']+)["']/i.exec(
          /<source[^>]*>/i.exec(block)?.[0] ?? "",
        )?.[1] ?? "");
      return isHttpUrl(src) ? `![video](${src})` : block;
    },
  );

const htmlAudioToMarkdown = (text: string) =>
  text.replace(/<audio\s+[^>]*>/gi, (tag) => {
    const src = extractMediaSrc(tag);
    return isHttpUrl(src) ? `![audio](${src})` : tag;
  });

const htmlMediaToMarkdown = (text: string) =>
  htmlAudioToMarkdown(htmlVideoToMarkdown(text))
    .replace(/<source\s+[^>]*>/gi, "")
    .replace(/<\/video>/gi, "")
    .replace(/<\/audio>/gi, "");

const htmlAnchorToMarkdown = (text: string) =>
  text.replace(
    /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_, href, label) => `[${label}](${href})`,
  );

const htmlStyledToMd = (tag: string, md: string) => (text: string) =>
  text
    .replace(
      new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "gi"),
      `${md}$1${md}`,
    )
    .replace(
      new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]+)$`, "gi"),
      `${md}$1${md}`,
    );

export const htmlInlineToMarkdown = (text: string) =>
  [
    { tag: "b", md: "**" },
    { tag: "strong", md: "**" },
    { tag: "i", md: "*" },
    { tag: "em", md: "*" },
  ].reduce((r, { tag, md }) => htmlStyledToMd(tag, md)(r), text);

export const htmlCodeToMarkdown = (text: string) =>
  text
    .replace(
      /<pre>\s*<code(?:\s[^>]*)?>([\s\S]*?)<\/code>\s*<\/pre>/gi,
      (_, content) => `\`\`\`\n${content.trim()}\n\`\`\``,
    )
    .replace(
      /<code(?:\s[^>]*)?>([\s\S]*?)<\/code>/gi,
      (_, content) => `\`${content}\``,
    );

export const decodeHtmlEntities = (text: string) =>
  text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");

export const preprocessText = (text: string) =>
  decodeHtmlEntities(
    htmlCodeToMarkdown(
      htmlAnchorToMarkdown(
        htmlImgToMarkdown(htmlMediaToMarkdown(htmlInlineToMarkdown(text))),
      ),
    ),
  );

export const copyToClipboard = async (text: string) => {
  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) {
    // fallback below
  }
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch (_) {
    return false;
  }
};

export const formatDuration = (seconds: number) => {
  if (!isFinite(seconds) || isNaN(seconds)) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

export const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const formatEditTime = (ts: number) =>
  new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export const editWindowMs = 5 * 60 * 1000;

export const showAuthorName = (hideNames?: boolean, isGroupChat?: boolean) =>
  !hideNames && isGroupChat;

export const estimateSerializedLength = (text: string) =>
  JSON.stringify({ text, type: "text" }).length;

export const charCountThreshold = 500;

const locationZoom = 15;
const tileSize = 256;
export const locationCardWidth = 256;
export const locationCardHeight = 200;

export const latLngToTileFraction = (lat: number, lng: number) => {
  const n = Math.pow(2, locationZoom);
  const latRad = (lat * Math.PI) / 180;
  return {
    x: ((lng + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) /
      2) * n,
  };
};

export const cartoTileUrl = (x: number, y: number) =>
  `https://basemaps.cartocdn.com/rastertiles/voyager/${locationZoom}/${x}/${y}.png`;

export const locationTileGrid = (lat: number, lng: number) => {
  const { x, y } = latLngToTileFraction(lat, lng);
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  const px = (x - tx) * tileSize;
  const py = (y - ty) * tileSize;
  const col0 = px >= tileSize / 2 ? tx : tx - 1;
  const row0 = py >= tileSize / 2 ? ty : ty - 1;
  const offsetX = locationCardWidth / 2 - ((x - col0) * tileSize);
  const offsetY = locationCardHeight / 2 - ((y - row0) * tileSize);
  return {
    tiles: [
      { x: col0, y: row0 },
      { x: col0 + 1, y: row0 },
      { x: col0, y: row0 + 1 },
      { x: col0 + 1, y: row0 + 1 },
    ],
    offsetX,
    offsetY,
  };
};

export const googleMapsUrl = (lat: number, lng: number) =>
  `https://www.google.com/maps?q=${lat},${lng}`;

const playNote =
  (ctx: AudioContext) =>
  (frequency: number, startTime: number, duration: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.15, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration);
  };

export const playNotificationSound = () => {
  const ctx = new AudioContext();
  const now = ctx.currentTime;
  const note = playNote(ctx);
  note(523.25, now, 0.15);
  note(659.25, now + 0.12, 0.15);
  note(783.99, now + 0.24, 0.25);
};

const tsOf = (e: TimelineEntry): number =>
  e.kind === "message"
    ? e.msg.timestamp
    : e.kind === "stream"
    ? e.stream.timestamp
    : e.kind === "spinner"
    ? e.spinner.timestamp
    : e.progress.timestamp;

export const buildTimeline = (
  messages: AbstracChatMessage[],
  spinners: ActiveSpinner[],
  progress: ActiveProgress[],
  streams: ActiveStream[],
): TimelineEntry[] => {
  const sorted = sortKey((x: AbstracChatMessage) => x.timestamp)(messages);
  const msgEntries: TimelineEntry[] = sorted.map((msg, i) => ({
    kind: "message",
    msg,
    prevMsg: sorted[i - 1],
  }));
  const spinnerEntries: TimelineEntry[] = spinners.map((s) => ({
    kind: "spinner",
    spinner: s,
  }));
  const progressEntries: TimelineEntry[] = progress.map((p) => ({
    kind: "progress",
    progress: p,
  }));
  const streamEntries: TimelineEntry[] = streams.map((s) => ({
    kind: "stream",
    stream: s,
    prevMsg: sorted.filter((m) => m.timestamp <= s.timestamp).pop(),
  }));
  return sortKey(tsOf)([
    ...msgEntries,
    ...spinnerEntries,
    ...progressEntries,
    ...streamEntries,
  ]);
};

const splitWords = (s: string) => s.split(/(\s+)/).filter(Boolean);

const buildLcsRow = (prev: number[], a_i: string, b: string[]) =>
  b.reduce<number[]>(
    (row, bj, j) => {
      row[j + 1] = a_i === bj ? prev[j] + 1 : Math.max(prev[j + 1], row[j]);
      return row;
    },
    [0, ...Array<number>(b.length).fill(0)],
  );

const buildLcsTable = (a: string[], b: string[]) =>
  a.reduce<number[][]>(
    (table, ai) => [...table, buildLcsRow(table[table.length - 1], ai, b)],
    [Array<number>(b.length + 1).fill(0)],
  );

const backtrackDiff = (
  table: number[][],
  a: string[],
  b: string[],
  i: number,
  j: number,
): DiffPart[] => {
  if (i === 0 && j === 0) return [];
  if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
    return [...backtrackDiff(table, a, b, i - 1, j - 1), {
      text: a[i - 1],
      kind: "same",
    }];
  }
  if (j > 0 && (i === 0 || table[i][j - 1] >= table[i - 1][j])) {
    return [...backtrackDiff(table, a, b, i, j - 1), {
      text: b[j - 1],
      kind: "add",
    }];
  }
  return [...backtrackDiff(table, a, b, i - 1, j), {
    text: a[i - 1],
    kind: "del",
  }];
};

const mergeDiffParts = (parts: DiffPart[]) =>
  parts.reduce<DiffPart[]>(
    (acc, part) =>
      !empty(acc) && acc[acc.length - 1].kind === part.kind
        ? [...acc.slice(0, -1), {
          text: acc[acc.length - 1].text + part.text,
          kind: part.kind,
        }]
        : [...acc, part],
    [],
  );

export const wordDiff = (oldText: string, newText: string) => {
  const a = splitWords(oldText);
  const b = splitWords(newText);
  return mergeDiffParts(
    backtrackDiff(buildLcsTable(a, b), a, b, a.length, b.length),
  );
};

export const successorText = (
  edits: EditHistoryEntry[],
  currentText: string,
  i: number,
) =>
  i === edits.length - 1
    ? edits.length > 1 ? edits[0].text : currentText
    : i === edits.length - 2
    ? currentText
    : edits[i + 1].text;

export const submitEdit =
  (onEdit: (text: string) => void, text: string, originalText: string) =>
  (setIsEditing: (v: boolean) => void) => {
    if (text.trim() && text !== originalText) onEdit(text);
    setIsEditing(false);
  };

export const computeTimeAgo = (timestamp: number) => {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - timestamp;
  if (diff < 60000) return "just now";
  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;
  }
  if (date.toDateString() === now.toDateString()) {
    const hours = Math.floor(diff / 3600000);
    return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  }
  const showYear = date.getFullYear() !== now.getFullYear();
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(showYear ? { year: "numeric" } : {}),
  });
};
