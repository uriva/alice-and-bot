import { empty, range } from "@uri/gamla";

export const maxCanvasLength = 64_000;

export const contextSlack = 2;

export type CanvasEdit =
  | { readonly kind: "set"; readonly text: string }
  | {
    readonly kind: "replace";
    readonly find: string;
    readonly replace: string;
    readonly all?: boolean;
  }
  | { readonly kind: "patch"; readonly patch: string };

export type PatchHunk = {
  readonly oldStart: number;
  readonly oldLines: string[];
  readonly newLines: string[];
};

export type PatchProblem = {
  readonly reason:
    | "malformed"
    | "no-hunks"
    | "context-not-found"
    | "ambiguous"
    | "too-long";
  readonly message: string;
  readonly hunkIndex?: number;
  readonly near?: string;
  readonly occurrences?: number;
};

export type PatchOutcome =
  | { readonly ok: true; readonly text: string; readonly hunksApplied: number }
  | ({ readonly ok: false } & PatchProblem);

export type ParsedPatch =
  | { readonly ok: true; readonly hunks: PatchHunk[] }
  | {
    readonly ok: false;
    readonly reason: "malformed" | "no-hunks";
    readonly message: string;
  };

type ParseState = {
  readonly hunks: PatchHunk[];
  readonly current?: PatchHunk;
  readonly bad?: string;
};

type Anchor = { readonly at: number; readonly drop: number };

type ApplyState = {
  readonly lines: string[];
  readonly offset: number;
  readonly hunksApplied: number;
  readonly failure?: PatchProblem;
};

const hunkHeaderPattern = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

const headerOldStart = (line: string) => {
  const match = hunkHeaderPattern.exec(line);
  return match === null ? undefined : Number(match[1]);
};

const startHunk = (oldStart: number): PatchHunk => ({
  oldStart,
  oldLines: [],
  newLines: [],
});

const pushOldLine = (state: ParseState, body: string): ParseState =>
  state.current === undefined ? state : {
    ...state,
    current: { ...state.current, oldLines: [...state.current.oldLines, body] },
  };

const pushNewLine = (state: ParseState, body: string): ParseState =>
  state.current === undefined ? state : {
    ...state,
    current: { ...state.current, newLines: [...state.current.newLines, body] },
  };

const foldLine = (state: ParseState, line: string): ParseState => {
  if (line.startsWith("@@")) {
    const oldStart = headerOldStart(line);
    if (oldStart === undefined) {
      return { ...state, bad: state.bad ?? `malformed hunk header: ${line}` };
    }
    return {
      hunks: state.current === undefined
        ? state.hunks
        : [...state.hunks, state.current],
      current: startHunk(oldStart),
      bad: state.bad,
    };
  }
  if (state.current === undefined) return state;
  const marker = line.slice(0, 1);
  if (marker === "-") return pushOldLine(state, line.slice(1));
  if (marker === "+") return pushNewLine(state, line.slice(1));
  if (marker === " ") {
    const body = line.slice(1);
    return pushNewLine(pushOldLine(state, body), body);
  }
  return state;
};

export const parsePatch = (patch: string): ParsedPatch => {
  const state: ParseState = patch.split("\n").reduce(foldLine, { hunks: [] });
  if (state.bad !== undefined) {
    return { ok: false, reason: "malformed", message: state.bad };
  }
  const hunks = state.current === undefined
    ? state.hunks
    : [...state.hunks, state.current];
  if (empty(hunks)) {
    return {
      ok: false,
      reason: "no-hunks",
      message: "patch contains no @@ hunks",
    };
  }
  return { ok: true, hunks };
};

const commonPrefixLength = (a: string[], b: string[]) => {
  const limit = Math.min(a.length, b.length);
  const mismatch = range(0, limit + 1).findIndex((i) => a[i] !== b[i]);
  return mismatch < 0 ? limit : mismatch;
};

const commonSuffixLength = (a: string[], b: string[], prefix: number) => {
  const limit = Math.min(a.length, b.length) - prefix;
  const mismatch = range(0, limit + 1).findIndex((i) =>
    a[a.length - 1 - i] !== b[b.length - 1 - i]
  );
  return mismatch < 0 ? limit : mismatch;
};

const windowMatches = (lines: string[], want: string[], at: number) =>
  at >= 0 && lines.slice(at, at + want.length).join("\n") === want.join("\n");

const scanForward = (lines: string[], want: string[], from: number) =>
  range(0, lines.length + 1).findIndex((at) =>
    at >= from && windowMatches(lines, want, at)
  );

const scanBackward = (lines: string[], want: string[], before: number) => {
  const hits = range(0, Math.max(0, before) + 1).filter((at) =>
    windowMatches(lines, want, at)
  );
  return empty(hits) ? -1 : hits[hits.length - 1];
};

// Line numbers in the header are a hint, not a requirement: a scan of the whole
// document is cheap at canvas sizes, and authors get them wrong.
const findExact = (lines: string[], want: string[], hint: number): Anchor => {
  if (empty(want)) {
    return { at: Math.min(Math.max(0, hint), lines.length), drop: 0 };
  }
  const forward = scanForward(lines, want, Math.max(0, hint));
  if (forward >= 0) return { at: forward, drop: 0 };
  return { at: scanBackward(lines, want, hint - 1), drop: 0 };
};

// Hunks often trim leading or trailing context. Retry with progressively
// trimmed context so a correct edit is not rejected over it.
const trimmedCandidates = (want: string[]) =>
  range(0, contextSlack + 1)
    .flatMap((amount) => [
      { drop: amount, take: 0 },
      { drop: 0, take: amount },
      { drop: amount, take: amount },
    ])
    .map(({ drop, take }) => ({
      drop,
      lines: want.slice(drop, want.length - take),
    }))
    .filter(({ lines }) => !empty(lines));

const findAnchor = (lines: string[], want: string[], hint: number): Anchor => {
  const exact = findExact(lines, want, hint);
  if (exact.at >= 0) return exact;
  const attempt = trimmedCandidates(want)
    .map((candidate) => ({
      drop: candidate.drop,
      at: findExact(lines, candidate.lines, hint).at,
    }))
    .find(({ at }) => at >= 0);
  return attempt ?? { at: -1, drop: 0 };
};

const spliceHunk = (
  { lines, at, oldLines, newLines }: {
    lines: string[];
    at: number;
    oldLines: string[];
    newLines: string[];
  },
) => {
  const prefix = commonPrefixLength(oldLines, newLines);
  const suffix = commonSuffixLength(oldLines, newLines, prefix);
  return [
    ...lines.slice(0, at),
    ...oldLines.slice(0, prefix),
    ...newLines.slice(prefix, newLines.length - suffix),
    ...oldLines.slice(oldLines.length - suffix),
    ...lines.slice(at + oldLines.length),
  ];
};

const excerptAround = (lines: string[], at: number, span: number) =>
  lines.slice(Math.max(0, at - 1), at + span + 1).join("\n");

const applyHunk =
  (hunk: PatchHunk, hunkIndex: number) => (state: ApplyState): ApplyState => {
    if (state.failure !== undefined) return state;
    // A zero-length original range means "insert after line oldStart" in
    // unified diff, so its hint is one higher than a replacement's.
    const anchorLine = hunk.oldStart - (empty(hunk.oldLines) ? 0 : 1);
    const hint = Math.max(0, anchorLine + state.offset);
    const anchor = findAnchor(state.lines, hunk.oldLines, hint);
    if (anchor.at < 0) {
      return {
        ...state,
        failure: {
          reason: "context-not-found",
          message: `hunk ${
            hunkIndex + 1
          } does not match the canvas; the lines it expects to change were not found`,
          hunkIndex,
          near: excerptAround(state.lines, hint, hunk.oldLines.length + 2),
        },
      };
    }
    const at = anchor.at + anchor.drop;
    return {
      lines: spliceHunk({
        lines: state.lines,
        at,
        oldLines: hunk.oldLines,
        newLines: hunk.newLines,
      }),
      offset: state.offset + hunk.newLines.length - hunk.oldLines.length,
      hunksApplied: state.hunksApplied + 1,
    };
  };

const guardLength = (outcome: PatchOutcome): PatchOutcome =>
  outcome.ok && outcome.text.length > maxCanvasLength
    ? {
      ok: false,
      reason: "too-long",
      message:
        `result is ${outcome.text.length} characters, over the ${maxCanvasLength} limit`,
    }
    : outcome;

export const applyPatch = (
  { text, patch }: { text: string; patch: string },
): PatchOutcome => {
  const parsed = parsePatch(patch);
  if (!parsed.ok) return parsed;
  const state: ApplyState = parsed.hunks.reduce(
    (acc, hunk, hunkIndex) => applyHunk(hunk, hunkIndex)(acc),
    { lines: text.split("\n"), offset: 0, hunksApplied: 0 },
  );
  if (state.failure !== undefined) return { ok: false, ...state.failure };
  return guardLength({
    ok: true,
    text: state.lines.join("\n"),
    hunksApplied: state.hunksApplied,
  });
};

const applyReplace = ({ text, find, replace, all }: {
  text: string;
  find: string;
  replace: string;
  all?: boolean;
}): PatchOutcome => {
  if (!find) {
    return {
      ok: false,
      reason: "malformed",
      message: "find must not be empty",
    };
  }
  const occurrences = text.split(find).length - 1;
  if (occurrences === 0) {
    return {
      ok: false,
      reason: "context-not-found",
      message: "the text to replace was not found on the canvas",
    };
  }
  if (occurrences > 1 && all !== true) {
    return {
      ok: false,
      reason: "ambiguous",
      message:
        `the text to replace appears ${occurrences} times; include more surrounding context to make it unique, or set all`,
      occurrences,
    };
  }
  return guardLength({
    ok: true,
    text: all === true
      ? text.split(find).join(replace)
      : text.replace(find, () => replace),
    hunksApplied: 1,
  });
};

export const applyEdit = (
  { text, edit }: { text: string; edit: CanvasEdit },
): PatchOutcome => {
  if (edit.kind === "set") {
    return guardLength({ ok: true, text: edit.text, hunksApplied: 0 });
  }
  if (edit.kind === "replace") {
    return applyReplace({
      text,
      find: edit.find,
      replace: edit.replace,
      all: edit.all,
    });
  }
  return applyPatch({ text, patch: edit.patch });
};
