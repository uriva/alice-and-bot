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
    program = parse(tokenize(`${body}\n${canvasPrelude}`), unary);
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
  const validation = validateView(rendered);
  if (!validation.ok) {
    return {
      ok: false,
      problems: validation.problems.map((invalid) => ({
        stage: "view",
        message: `${invalid.path}: ${invalid.message}`,
      })),
    };
  }
  if (!isViewElement(rendered)) {
    return {
      ok: false,
      problems: [{ stage: "view", message: "root: must be an element" }],
    };
  }
  return { ok: true, view: rendered, emitted };
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
  if (!isViewElement(result)) return { ok: true, emitted };
  const validation = validateView(result);
  if (!validation.ok) {
    return {
      ok: false,
      problems: validation.problems.map((invalid) => ({
        stage: "view",
        message: `${invalid.path}: ${invalid.message}`,
      })),
    };
  }
  return { ok: true, emitted, view: result };
};
