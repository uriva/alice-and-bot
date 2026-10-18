import { op } from "@uri/safescript";
import {
  builtinRegistry,
  builtinUnaryFields,
  computeSignature,
  interpret,
  parse,
  tokenize,
} from "@uri/safescript";
import type { DagOp, Program } from "@uri/safescript";
import { z } from "zod";
import { canvasPrelude } from "./prelude.ts";
import { isViewElement, validateView, type ViewElement } from "./view.ts";

// safescript does not re-export OpEntry, so mirror its shape here — including
// the `any` parameters its own registry uses, which is what makes a concrete op
// assignable to the registry. Once safescript exports the type, this collapses
// to an import.
type OpEntry = {
  readonly staticFields: ReadonlySet<string>;
  readonly unaryField: string | null;
  // deno-lint-ignore no-explicit-any
  readonly create: (staticParams: Record<string, unknown>) => DagOp<any, any>;
};

export const maxCanvasRuntimeMs = 2_000;

export const maxEmittedBytes = 8_000;

export type Json =
  | string
  | number
  | boolean
  | null
  | readonly Json[]
  | { readonly [key: string]: Json };

// `data` is whatever JSON the canvas chose to emit. `action` is supplied by the
// host from the binding that fired, so the payload itself needs no schema.
export type CanvasEvent = { readonly action: string; readonly data: Json };

export type CanvasStage =
  | "parse"
  | "policy"
  | "render"
  | "view"
  | "timeout";

export type CanvasProblem = {
  readonly stage: CanvasStage;
  readonly message: string;
};

export type CanvasRender =
  | {
    readonly ok: true;
    readonly view: ViewElement;
    readonly emitted: CanvasEvent[];
  }
  | { readonly ok: false; readonly problems: CanvasProblem[] };

export type CanvasAction =
  | {
    readonly ok: true;
    readonly emitted: CanvasEvent[];
    readonly view?: ViewElement;
  }
  | { readonly ok: false; readonly problems: CanvasProblem[] };

type Prepared =
  | { readonly ok: false; readonly problems: CanvasProblem[] }
  | {
    readonly ok: true;
    readonly program: Program;
    readonly registry: ReadonlyMap<string, OpEntry>;
    readonly hasAct: boolean;
  };

const emitOp = (sink: CanvasEvent[], current: () => string) =>
  op({
    input: z.object({ value: z.unknown() }),
    output: z.object({ ok: z.literal(true) }),
    tags: ["pure"],
    resources: { memoryBytes: 256, runtimeMs: 1, diskBytes: 0 },
    run: ({ value }) => {
      sink.push({ action: current(), data: toJson(value) });
      return Promise.resolve({ ok: true as const });
    },
  });

// One registry per invocation: `emit` closes over its own sink, so overlapping
// runs in a single tab cannot see each other's events.
const registryFor = (sink: CanvasEvent[], current: () => string) => ({
  registry: new Map<string, OpEntry>([
    ...builtinRegistry,
    [
      "emit",
      {
        staticFields: new Set(),
        unaryField: "value",
        create: () => emitOp(sink, current),
      },
    ],
  ]),
  unary: new Map<string, string>([...builtinUnaryFields, ["emit", "value"]]),
});

const executionContext = { fetch: globalThis.fetch.bind(globalThis) };

// A safescript value can be anything its ops return, so normalise before it
// becomes a canvas-event: drop undefined and functions, reject cycles.
export const toJson = (value: unknown): Json => {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(toJson);
  if (typeof value === "object") {
    const entries = Object.entries(value).flatMap(([key, entry]) =>
      entry === undefined || typeof entry === "function"
        ? []
        : [[key, toJson(entry)] as const]
    );
    return Object.fromEntries(entries);
  }
  return null;
};

export const serializedLength = (value: Json) =>
  JSON.stringify(value)?.length ?? 0;

const problem = (stage: CanvasStage, error: unknown): CanvasProblem => ({
  stage,
  message: error instanceof Error ? error.message : String(error),
});

const isTimeout = (error: unknown) =>
  error instanceof Error && error.message.startsWith("timed out after");

// computeSignature throws when a call names something that is neither a builtin
// nor a function in the program, which is the most common authoring mistake.
const policyProblems = (
  program: Program,
  registry: ReadonlyMap<string, OpEntry>,
): CanvasProblem[] => {
  let signature;
  try {
    signature = computeSignature(program, "view", registry);
  } catch (error) {
    return [problem("parse", error)];
  }
  if (signature.hosts.size > 0) {
    return [{
      stage: "policy",
      message: `a canvas may not make network requests (declared hosts: ${
        [...signature.hosts].join(", ")
      })`,
    }];
  }
  if (signature.envReads.size > 0) {
    return [{
      stage: "policy",
      message: "a canvas may not read environment variables",
    }];
  }
  if (signature.runtimeMs > maxCanvasRuntimeMs) {
    return [{
      stage: "policy",
      message:
        `the canvas declares up to ${signature.runtimeMs}ms of work, over the ${maxCanvasRuntimeMs}ms budget`,
    }];
  }
  return [];
};

type Tok = ReturnType<typeof tokenize>[number];

const twoArgPreludeFns = new Set([
  "span",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "small",
  "mark",
  "sub",
  "sup",
  "time",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "lead",
  "div",
  "section",
  "article",
  "header",
  "footer",
  "nav",
  "main",
  "aside",
  "row",
  "col",
  "ul",
  "ol",
  "li",
  "list",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "dl",
  "dt",
  "dd",
  "figure",
  "figcaption",
  "blockquote",
  "select",
  "option",
  "code",
  "pre",
  "submitButton",
  "label",
  "quote",
  "stat",
]);

const threeArgInputPreludeFns = new Set(["input", "textarea", "img"]);
const linkPreludeFns = new Set(["link", "a"]);
const voidTagPreludeFns = new Set(["br", "hr"]);

const isPreludeHelper = (name: string) =>
  twoArgPreludeFns.has(name) ||
  threeArgInputPreludeFns.has(name) ||
  linkPreludeFns.has(name) ||
  voidTagPreludeFns.has(name) ||
  name === "badge" ||
  name === "button" ||
  name === "card" ||
  name === "form";

const findCloseParen = (
  tokens: readonly Tok[],
  idx: number,
  depth: number,
): number => {
  if (idx >= tokens.length) return -1;
  const k = tokens[idx].kind;
  const nextDepth = k === "(" || k === "[" || k === "{"
    ? depth + 1
    : k === ")" || k === "]" || k === "}"
    ? depth - 1
    : depth;
  return nextDepth === 0 ? idx : findCloseParen(tokens, idx + 1, nextDepth);
};

const splitTopLevelArgs = (tokens: readonly Tok[]): Tok[][] => {
  if (tokens.length === 0) return [];
  const { current, acc } = tokens.reduce<{
    depth: number;
    current: Tok[];
    acc: Tok[][];
  }>(
    (state, tok) => {
      const k = tok.kind;
      const nextDepth = k === "(" || k === "[" || k === "{"
        ? state.depth + 1
        : k === ")" || k === "]" || k === "}"
        ? state.depth - 1
        : state.depth;
      return k === "," && state.depth === 0
        ? { depth: nextDepth, current: [], acc: [...state.acc, state.current] }
        : {
          depth: nextDepth,
          current: [...state.current, tok],
          acc: state.acc,
        };
    },
    { depth: 0, current: [], acc: [] },
  );
  return [...acc, current];
};

const isNamedArgCall = (args: Tok[][]): boolean => {
  if (args.length !== 1) return false;
  const [first, second, third] = args[0];
  if (!first || first.kind !== "{" || !second) return false;
  if (second.kind === "}") return true;
  return (second.kind === "ident" || second.kind === "string") &&
    (third?.kind === ":" || third?.kind === "," || third?.kind === "}");
};

const containerChildrenPreludeFns = new Set([
  "div",
  "section",
  "article",
  "header",
  "footer",
  "nav",
  "main",
  "aside",
  "row",
  "col",
  "ul",
  "ol",
  "table",
  "thead",
  "tbody",
  "tr",
  "dl",
  "figure",
  "select",
]);

const strArg = (value: string, refTok: Tok): Tok[] => [
  { kind: "string", value, line: refTok.line, col: refTok.col },
];

const ensureArrayArg = (arg: Tok[], refTok: Tok): Tok[] => {
  const first = arg[0];
  if (!first || first.kind === "[") return arg;
  if (
    first.kind === "string" ||
    (first.kind === "ident" && isPreludeHelper(first.value))
  ) {
    return [
      { kind: "[", value: "[", line: refTok.line, col: refTok.col },
      ...arg,
      { kind: "]", value: "]", line: refTok.line, col: refTok.col },
    ];
  }
  return arg;
};

const joinArgsWithCommas = (args: Tok[][], refTok: Tok): Tok[] => {
  const commaTok: Tok = {
    kind: ",",
    value: ",",
    line: refTok.line,
    col: refTok.col,
  };
  return args.flatMap((arg, idx) => (idx === 0 ? arg : [commaTok, ...arg]));
};

const normalizeHelperArgs = (
  name: string,
  args: Tok[][],
  refTok: Tok,
): Tok[][] => {
  if (twoArgPreludeFns.has(name)) {
    const normalizeFirst = containerChildrenPreludeFns.has(name)
      ? (a: Tok[]) => ensureArrayArg(a, refTok)
      : (a: Tok[]) => a;
    if (args.length === 0) {
      return [normalizeFirst(strArg("", refTok)), strArg("", refTok)];
    }
    if (args.length === 1) return [normalizeFirst(args[0]), strArg("", refTok)];
    return [normalizeFirst(args[0]), args[1]];
  }
  if (name === "badge") {
    if (args.length === 0) {
      return [strArg("", refTok), strArg("primary", refTok)];
    }
    if (args.length === 1) return [args[0], strArg("primary", refTok)];
    return [args[0], args[1]];
  }
  if (name === "button") {
    if (args.length === 0) {
      return [
        strArg("", refTok),
        strArg("click", refTok),
        strArg("", refTok),
      ];
    }
    if (args.length === 1) {
      return [args[0], strArg("click", refTok), strArg("", refTok)];
    }
    if (args.length === 2) return [args[0], args[1], strArg("", refTok)];
    return [args[0], args[1], args[2]];
  }
  if (name === "card") {
    if (args.length === 0) {
      return [
        strArg("", refTok),
        ensureArrayArg(strArg("", refTok), refTok),
        strArg("", refTok),
      ];
    }
    if (args.length === 1) {
      return [
        strArg("", refTok),
        ensureArrayArg(args[0], refTok),
        strArg("", refTok),
      ];
    }
    if (args.length === 2) {
      return [args[0], ensureArrayArg(args[1], refTok), strArg("", refTok)];
    }
    return [args[0], ensureArrayArg(args[1], refTok), args[2]];
  }
  if (name === "form") {
    if (args.length === 0) {
      return [
        strArg("submit", refTok),
        ensureArrayArg(strArg("", refTok), refTok),
        strArg("", refTok),
      ];
    }
    if (args.length === 1) {
      return [
        strArg("submit", refTok),
        ensureArrayArg(args[0], refTok),
        strArg("", refTok),
      ];
    }
    if (args.length === 2) {
      return [args[0], ensureArrayArg(args[1], refTok), strArg("", refTok)];
    }
    return [args[0], ensureArrayArg(args[1], refTok), args[2]];
  }
  if (threeArgInputPreludeFns.has(name)) {
    if (args.length === 0) {
      return [strArg("", refTok), strArg("", refTok), strArg("", refTok)];
    }
    if (args.length === 1) {
      return [args[0], strArg("", refTok), strArg("", refTok)];
    }
    if (args.length === 2) return [args[0], args[1], strArg("", refTok)];
    return [args[0], args[1], args[2]];
  }
  if (linkPreludeFns.has(name)) {
    if (args.length === 0) {
      return [strArg("", refTok), strArg("#", refTok), strArg("", refTok)];
    }
    if (args.length === 1) {
      return [args[0], strArg("#", refTok), strArg("", refTok)];
    }
    if (args.length === 2) return [args[0], args[1], strArg("", refTok)];
    return [args[0], args[1], args[2]];
  }
  if (voidTagPreludeFns.has(name)) {
    return args.length === 0 ? [strArg("", refTok)] : [args[0]];
  }
  return args;
};

const normalizeCallTokens = (
  tokens: readonly Tok[],
  shadowed: ReadonlySet<string>,
  idx = 0,
): Tok[] => {
  if (idx >= tokens.length) return [];
  const tok = tokens[idx];
  const next = tokens[idx + 1];
  const prev = idx > 0 ? tokens[idx - 1] : undefined;
  if (
    tok.kind === "ident" &&
    next?.kind === "(" &&
    prev?.kind !== "." &&
    isPreludeHelper(tok.value) &&
    !shadowed.has(tok.value)
  ) {
    const closeIdx = findCloseParen(tokens, idx + 1, 0);
    if (closeIdx > idx + 1) {
      const inner = normalizeCallTokens(
        tokens.slice(idx + 2, closeIdx),
        shadowed,
      );
      const args = splitTopLevelArgs(inner);
      const normalizedInner = isNamedArgCall(args)
        ? inner
        : joinArgsWithCommas(normalizeHelperArgs(tok.value, args, tok), tok);
      return [
        tok,
        next,
        ...normalizedInner,
        tokens[closeIdx],
        ...normalizeCallTokens(tokens, shadowed, closeIdx + 1),
      ];
    }
  }
  return [tok, ...normalizeCallTokens(tokens, shadowed, idx + 1)];
};

const normalizeViewNode = (node: unknown): unknown => {
  if (!isViewElement(node)) return node;
  if (!Array.isArray(node.children)) return node;
  const flatChildren = node.children
    .flatMap((child: unknown) => (Array.isArray(child) ? child : [child]))
    .map(normalizeViewNode);
  return { ...node, children: flatChildren };
};

const prepare = (
  body: string,
  sink: CanvasEvent[],
  current: () => string,
): Prepared => {
  const { registry, unary } = registryFor(sink, current);
  let program: Program;
  try {
    // The prelude goes after the body: function order does not matter, and this
    // keeps line numbers in parse errors pointing at the author's own code.
    const bodyLineCount = body.split("\n").length;
    const allTokens = tokenize(`${body}\n${canvasPrelude}`);
    const bodyTokens = allTokens.filter(
      (t) => t.kind !== "eof" && t.line <= bodyLineCount,
    );
    const preludeTokens = allTokens.filter(
      (t) => t.kind === "eof" || t.line > bodyLineCount,
    );
    const shadowed = new Set(
      bodyTokens.flatMap((t, i) =>
        t.kind === "ident" && bodyTokens[i + 1]?.kind === "=" ? [t.value] : []
      ),
    );
    program = parse(
      [...normalizeCallTokens(bodyTokens, shadowed), ...preludeTokens],
      unary,
    );
  } catch (error) {
    return { ok: false, problems: [problem("parse", error)] };
  }
  const problems = policyProblems(program, registry);
  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    program,
    registry,
    hasAct: program.functions.some((fn) => fn.name === "act"),
  };
};

const withTimeout = async <T>(work: Promise<T>, ms: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([work, expiry]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};

export const renderCanvas = async (
  { body }: { body: string },
): Promise<CanvasRender> => {
  const emitted: CanvasEvent[] = [];
  const prepared = prepare(body, emitted, () => "");
  if (!prepared.ok) return prepared;
  let rendered: unknown;
  try {
    rendered = await withTimeout(
      interpret(
        prepared.program,
        "view",
        {},
        executionContext,
        prepared.registry,
        "canvas.ss",
      ),
      maxCanvasRuntimeMs,
    );
  } catch (error) {
    return {
      ok: false,
      problems: [problem(isTimeout(error) ? "timeout" : "render", error)],
    };
  }
  const normalized = normalizeViewNode(rendered);
  const validation = validateView(normalized);
  if (!validation.ok) {
    return {
      ok: false,
      problems: validation.problems.map((invalid) => ({
        stage: "view",
        message: `${invalid.path}: ${invalid.message}`,
      })),
    };
  }
  if (!isViewElement(normalized)) {
    return {
      ok: false,
      problems: [{ stage: "view", message: "root: must be an element" }],
    };
  }
  return { ok: true, view: normalized, emitted };
};

export const actOnCanvas = async ({
  body,
  action,
  fields,
}: {
  body: string;
  action: string;
  fields: Readonly<Record<string, string>>;
}): Promise<CanvasAction> => {
  const emitted: CanvasEvent[] = [];
  const prepared = prepare(body, emitted, () => action);
  if (!prepared.ok) return prepared;
  if (!prepared.hasAct) return { ok: true, emitted: [] };
  let result: unknown;
  try {
    result = await withTimeout(
      interpret(
        prepared.program,
        "act",
        { action, fields },
        executionContext,
        prepared.registry,
        "canvas.ss",
      ),
      maxCanvasRuntimeMs,
    );
  } catch (error) {
    return {
      ok: false,
      problems: [problem(isTimeout(error) ? "timeout" : "render", error)],
    };
  }
  const oversized = emitted.find((event) =>
    serializedLength(event.data) > maxEmittedBytes
  );
  if (oversized !== undefined) {
    return {
      ok: false,
      problems: [{
        stage: "render",
        message: `emitted data is ${
          serializedLength(oversized.data)
        } characters, over the ${maxEmittedBytes} limit`,
      }],
    };
  }
  const normalized = normalizeViewNode(result);
  if (!isViewElement(normalized)) return { ok: true, emitted };
  const validation = validateView(normalized);
  if (!validation.ok) {
    return {
      ok: false,
      problems: validation.problems.map((invalid) => ({
        stage: "view",
        message: `${invalid.path}: ${invalid.message}`,
      })),
    };
  }
  return { ok: true, emitted, view: normalized };
};
