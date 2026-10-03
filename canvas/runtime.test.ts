import { assertEquals } from "@std/assert";
import { actOnCanvas, maxEmittedBytes, renderCanvas } from "./runtime.ts";
import { validateView, type ViewNode, viewText } from "./view.ts";

const landing = `
view = () => {
  return section([
    header([h1("Ship your site in 60 seconds")], "canvas-hero"),
    lead("Describe it, get a page."),
    button("Get started", "cta-clicked")
  ], "canvas-page")
}
`;

Deno.test("renderCanvas renders a program that uses the prelude", async () => {
  const result = await renderCanvas({ body: landing });
  assertEquals(result.ok, true);
  if (!result.ok) return;
  assertEquals(result.view.tag, "section");
  assertEquals(result.view.attrs?.class, "canvas-page");
  assertEquals(
    viewText(result.view).includes("Ship your site in 60 seconds"),
    true,
  );
});

Deno.test("renderCanvas returns the tree from act so a program can re-render", async () => {
  const result = await actOnCanvas({
    body: `${landing}
act = (action: string, fields) => {
  return view()
}`,
    action: "cta-clicked",
    fields: {},
  });
  assertEquals(result.ok, true);
  if (!result.ok) return;
  assertEquals(result.view?.tag, "section");
});

Deno.test("actOnCanvas collects emit calls as canvas events", async () => {
  const result = await actOnCanvas({
    body: `${landing}
act = (action: string, fields) => {
  emit("visitor clicked " + action)
  return emit("and then this too")
}`,
    action: "cta-clicked",
    fields: {},
  });
  assertEquals(result.ok, true);
  if (!result.ok) return;
  assertEquals(result.emitted, [
    { action: "cta-clicked", data: "visitor clicked cta-clicked" },
    { action: "cta-clicked", data: "and then this too" },
  ]);
});

Deno.test("actOnCanvas reads form fields through the action", async () => {
  const result = await actOnCanvas({
    body: `view = () => {
  return form("signup", [input("email", "you@example.com", "")], "canvas-form")
}

act = (action: string, fields) => {
  return emit(fields.email == null ? "" : fields.email)
}`,
    action: "signup",
    fields: { email: "someone@example.com" },
  });
  assertEquals(result.ok, true);
  if (!result.ok) return;
  assertEquals(result.emitted.map((event) => event.data), [
    "someone@example.com",
  ]);
});

Deno.test("actOnCanvas is a no-op when the program has no act", async () => {
  const result = await actOnCanvas({ body: landing, action: "x", fields: {} });
  assertEquals(result.ok, true);
  if (!result.ok) return;
  assertEquals(result.emitted, []);
});

Deno.test("renderCanvas surfaces a safescript parse error", async () => {
  const result = await renderCanvas({
    body: "view = () => { const x = 1; return x }",
  });
  assertEquals(result.ok, false);
  if (result.ok) return;
  assertEquals(result.problems[0].stage, "parse");
  assertEquals(result.problems[0].message.includes("const"), true);
});

Deno.test("renderCanvas reports line numbers from the author's own code", async () => {
  const result = await renderCanvas({
    body: "view = () => {\n  const x = 1\n  return h1(x)\n}",
  });
  assertEquals(result.ok, false);
  if (result.ok) return;
  assertEquals(result.problems[0].message.includes("at 2:3"), true);
});

Deno.test("renderCanvas reports a call to something that does not exist", async () => {
  const result = await renderCanvas({
    body: "view = () => { return h1(missingHelper()) }",
  });
  assertEquals(result.ok, false);
  if (result.ok) return;
  assertEquals(result.problems[0].stage, "parse");
  assertEquals(result.problems[0].message.includes("missingHelper"), true);
});

Deno.test("renderCanvas surfaces a runtime error", async () => {
  const result = await renderCanvas({
    body: 'view = () => { return h1(jsonParse("{").text) }',
  });
  assertEquals(result.ok, false);
  if (result.ok) return;
  assertEquals(result.problems[0].stage, "render");
});

Deno.test("renderCanvas refuses a program that declares a host", async () => {
  const result = await renderCanvas({
    body: `view = () => {
  r = httpRequest({ host: "evil.example.com", path: "/x" })
  return h1(r.body)
}`,
  });
  assertEquals(result.ok, false);
  if (result.ok) return;
  assertEquals(result.problems[0].stage, "policy");
  assertEquals(result.problems[0].message.includes("network"), true);
});

Deno.test("renderCanvas reports a view that does not satisfy the contract", async () => {
  const result = await renderCanvas({
    body: `view = () => {
  return el("div", { class: "x" }, [el("button", { onclick: "alert(1)" }, ["go"])])
}`,
  });
  assertEquals(result.ok, false);
  if (result.ok) return;
  assertEquals(result.problems[0].stage, "view");
  assertEquals(result.problems[0].message.includes("raw event handler"), true);
});

Deno.test("renderCanvas refuses an oversized emit", async () => {
  const result = await actOnCanvas({
    body: `view = () => h1("hi")

act = (action: string, fields) => {
  return emit("${"x".repeat(maxEmittedBytes + 10)}")
}`,
    action: "a",
    fields: {},
  });
  assertEquals(result.ok, false);
  if (result.ok) return;
  assertEquals(result.problems[0].stage, "render");
});

Deno.test("renderCanvas keeps concurrent runs separate", async () => {
  const body = `view = () => h1("hi")

act = (action: string, fields) => {
  return emit("from " + action)
}`;
  const [first, second] = await Promise.all([
    actOnCanvas({ body, action: "one", fields: {} }),
    actOnCanvas({ body, action: "two", fields: {} }),
  ]);
  assertEquals(first.ok && first.emitted.map((e) => e.data), ["from one"]);
  assertEquals(second.ok && second.emitted.map((e) => e.data), ["from two"]);
});

// ─── view contract ─────────────────────────────────────────────────────────

Deno.test("validateView accepts a well formed tree", () => {
  const tree: ViewNode = {
    tag: "div",
    attrs: { class: "page" },
    on: { click: "went" },
    children: ["text", { tag: "span", text: "more" }],
  };
  assertEquals(validateView(tree), { ok: true });
});

Deno.test("validateView rejects a root that is not an element", () => {
  assertEquals(validateView("just a string").ok, false);
  assertEquals(validateView([1, 2]).ok, false);
});

Deno.test("validateView rejects a script tag", () => {
  const result = validateView({ tag: "script", text: "steal()" });
  assertEquals(result.ok, false);
  if (result.ok) return;
  assertEquals(result.problems[0].message.includes("not allowed"), true);
});

Deno.test("validateView rejects innerHTML", () => {
  const result = validateView({ tag: "div", attrs: { innerHTML: "<b>x" } });
  assertEquals(result.ok, false);
  if (result.ok) return;
  assertEquals(result.problems[0].message.includes("not allowed"), true);
});

Deno.test("validateView rejects an unknown event", () => {
  const result = validateView({ tag: "div", on: { focus: "x" } });
  assertEquals(result.ok, false);
  if (result.ok) return;
  assertEquals(result.problems[0].message.includes("focus"), true);
});

Deno.test("validateView reports the path of a nested problem", () => {
  const result = validateView({
    tag: "div",
    children: [
      { tag: "p", text: "fine" },
      { tag: "span", children: [{ tag: "em", on: { click: "" } }] },
    ],
  });
  assertEquals(result.ok, false);
  if (result.ok) return;
  assertEquals(
    result.problems[0].path,
    "root.children[1].children[0].on.click",
  );
});

Deno.test("validateView rejects children that are not an array", () => {
  const result = validateView({ tag: "div", children: "nope" });
  assertEquals(result.ok, false);
  if (result.ok) return;
  assertEquals(result.problems[0].message.includes("must be an array"), true);
});

Deno.test("viewText flattens a tree", () => {
  assertEquals(
    viewText({ tag: "p", children: ["a", { tag: "b", text: "b" }, 3] }),
    "ab3",
  );
});

Deno.test("validateView rejects a tag outside the renderable set", async () => {
  const result = await renderCanvas({
    body: `view = () => {
  return el("marquee", { class: "x" }, ["scrolling"])
}`,
  });
  assertEquals(result.ok, false);
  if (result.ok) return;
  assertEquals(result.problems[0].stage, "view");
  assertEquals(result.problems[0].message.includes("not renderable"), true);
});
