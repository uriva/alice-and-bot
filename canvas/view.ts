export const maxViewNodes = 2_000;

export const maxViewDepth = 40;

// Attributes that would let a canvas program run code or reach outside itself.
// Event handlers must go through `on`, which routes to a canvas-event.
const forbiddenAttrs = [
  "innerhtml",
  "outerhtml",
  "dangerouslysetinnerhtml",
  "srcdoc",
  "__proto__",
  "constructor",
  "prototype",
];

export const allowedEvents = ["click", "submit", "change", "input", "keydown"];

const forbiddenTags = [
  "script",
  "iframe",
  "object",
  "embed",
  "link",
  "meta",
  "base",
];

export type ViewAttrs = Readonly<Record<string, string>>;

export type ViewElement = {
  readonly tag: string;
  readonly attrs?: ViewAttrs;
  readonly text?: string;
  readonly on?: Readonly<Record<string, string>>;
  readonly children?: readonly ViewNode[];
};

export type ViewNode = string | number | ViewElement;

export type ViewProblem = { readonly path: string; readonly message: string };

export type ViewValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly problems: ViewProblem[] };

export const isViewElement = (node: unknown): node is ViewElement =>
  typeof node === "object" && node !== null && !Array.isArray(node) &&
  typeof Reflect.get(node, "tag") === "string";

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const attrProblem = (path: string, key: string) => {
  const lowered = key.toLowerCase();
  if (forbiddenAttrs.includes(lowered)) {
    return `${path}.${key} is not allowed`;
  }
  if (lowered.startsWith("on")) {
    return `${path}.${key} would attach a raw event handler; use on: { event: "action" } instead`;
  }
  return undefined;
};

const collectProblems = (
  node: ViewNode,
  path: string,
  depth: number,
  budget: { left: number },
): ViewProblem[] => {
  if (budget.left <= 0) {
    return [{ path, message: `canvas view exceeds ${maxViewNodes} nodes` }];
  }
  budget.left -= 1;
  if (depth > maxViewDepth) {
    return [{
      path,
      message: `canvas view nests deeper than ${maxViewDepth} levels`,
    }];
  }
  if (typeof node === "string" || typeof node === "number") return [];

  const own: ViewProblem[] = [];
  const tag = node.tag.toLowerCase();
  if (forbiddenTags.includes(tag)) {
    own.push({
      path: `${path}.tag`,
      message: `<${tag}> is not allowed in a canvas view`,
    });
  }

  if (node.attrs !== undefined) {
    if (!isPlainRecord(node.attrs)) {
      own.push({
        path: `${path}.attrs`,
        message: "attrs must be an object of strings",
      });
    } else {
      own.push(
        ...Object.entries(node.attrs).map(([key, value]) => {
          const problem = attrProblem(`${path}.attrs`, key);
          if (problem !== undefined) {
            return { path: `${path}.attrs`, message: problem };
          }
          if (typeof value !== "string" && typeof value !== "number") {
            return {
              path: `${path}.attrs.${key}`,
              message: "attribute values must be strings",
            };
          }
          return undefined;
        }).filter((problem): problem is ViewProblem => problem !== undefined),
      );
    }
  }

  if (node.on !== undefined) {
    if (!isPlainRecord(node.on)) {
      own.push({
        path: `${path}.on`,
        message: "on must be an object of event to action",
      });
    } else {
      own.push(
        ...Object.entries(node.on).map(([event, action]) => {
          if (!allowedEvents.includes(event)) {
            return {
              path: `${path}.on`,
              message: `event "${event}" is not one of ${
                allowedEvents.join(", ")
              }`,
            };
          }
          if (typeof action !== "string" || action.length === 0) {
            return {
              path: `${path}.on.${event}`,
              message: "an action name is required",
            };
          }
          return undefined;
        }).filter((problem): problem is ViewProblem => problem !== undefined),
      );
    }
  }

  if (node.text !== undefined && typeof node.text !== "string") {
    own.push({ path: `${path}.text`, message: "text must be a string" });
  }

  const children = node.children;
  if (children !== undefined && !Array.isArray(children)) {
    own.push({
      path: `${path}.children`,
      message: "children must be an array",
    });
    return own;
  }

  return [
    ...own,
    ...(children ?? []).flatMap((child, index) =>
      collectProblems(
        child,
        `${path}.children[${index}]`,
        depth + 1,
        budget,
      )
    ),
  ];
};

// safescript does not type-check at runtime, so a program can produce a tree
// that looks structurally fine but is not renderable. Report every problem at
// once so an author can fix them in one pass.
export const validateView = (view: unknown): ViewValidation => {
  if (!isViewElement(view)) {
    return {
      ok: false,
      problems: [{
        path: "root",
        message: "the view must be an element with a tag",
      }],
    };
  }
  const problems = collectProblems(view, "root", 0, { left: maxViewNodes });
  return emptyProblems(problems) ? { ok: true } : { ok: false, problems };
};

const emptyProblems = (problems: ViewProblem[]) => problems.length === 0;

export const viewText = (node: ViewNode): string => {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  const own = node.text ?? "";
  const kids = (node.children ?? []).map(viewText).join("");
  return `${own}${kids}`;
};
