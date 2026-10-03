import { assertEquals } from "@std/assert";
import { renderCanvas } from "./runtime.ts";
import { canvasActions, toastLifetimeMs } from "./canvas-view.ts";
import { isRenderableTag, renderableTags, type ViewElement } from "./view.ts";

const viewFor = async (body: string): Promise<ViewElement> => {
  const result = await renderCanvas({ body });
  if (!result.ok) {
    throw new Error(result.problems.map((p) => p.message).join("\n"));
  }
  return result.view;
};

Deno.test("canvasActions finds every action bound in a tree", async () => {
  const view = await viewFor(`view = () => {
  return div([
    button("one", "first"),
    button("two", "second"),
    div([button("three", "third")], "nested"),
    form("submitted", [input("email", "you@example.com", "")], "")
  ], "page")
}`);
  assertEquals(canvasActions(view).sort(), [
    "first",
    "second",
    "submitted",
    "third",
  ]);
});

Deno.test("canvasActions reports nothing when nothing is bound", async () => {
  const view = await viewFor(`view = () => div([p("just text")], "page")`);
  assertEquals(canvasActions(view), []);
});

Deno.test("canvasActions ignores repeats of the same action", async () => {
  const view = await viewFor(`view = () => {
  return div([button("a", "same"), button("b", "same")], "page")
}`);
  assertEquals(canvasActions(view), ["same"]);
});

Deno.test("canvasActions walks into list items", async () => {
  const view = await viewFor(`view = () => {
  return div([list(["x", "y"], "l")], "page")
}`);
  assertEquals(canvasActions(view), []);
});

Deno.test("every renderable tag is accepted by the validator", () => {
  renderableTags.forEach((tag) => {
    if (isRenderableTag(tag.toUpperCase()) === false) {
      throw new Error(`${tag} should be renderable`);
    }
  });
});

Deno.test("the tag check is case insensitive and rejects anything else", () => {
  assertEquals(isRenderableTag("DIV"), true);
  assertEquals(isRenderableTag("marquee"), false);
  assertEquals(isRenderableTag("script"), false);
  assertEquals(isRenderableTag(""), false);
});

Deno.test("a full landing page program renders and stays within the tag set", async () => {
  const view = await viewFor(`view = () => {
  return section([
    header([h1("Ship it in 60 seconds")], "canvas-hero"),
    lead("Describe it, get a page."),
    row([
      card("Fast", [p("Renders instantly.")], ""),
      card("Safe", [p("Sandboxed.")], "")
    ], "canvas-grid"),
    form("signup", [
      label("Email", "email"),
      input("email", "you@example.com", ""),
      submitButton("Start")
    ], "canvas-signup")
  ], "canvas-page")
}`);
  assertEquals(view.tag, "section");
  assertEquals(canvasActions(view), ["signup"]);
});

Deno.test("toasts expire so messages do not pile up", () => {
  assertEquals(toastLifetimeMs, 5_000);
});
