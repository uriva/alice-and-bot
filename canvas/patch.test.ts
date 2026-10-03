import { assertEquals } from "@std/assert";
import { applyEdit, applyPatch, maxCanvasLength, parsePatch } from "./patch.ts";

const canvas = [
  "# Auto landing",
  "",
  'tagline = "Ship your site in 60s"',
  "",
  "view = () => {",
  "  return div([",
  '    h1("Hello"),',
  '    button("Start", "start-clicked")',
  '  ], { class: "page" })',
  "}",
].join("\n");

Deno.test("parsePatch reads hunks and ignores leading preamble", () => {
  const parsed = parsePatch(
    [
      "Here is the change you asked for:",
      "@@ -3,1 +3,1 @@",
      '-tagline = "Ship your site in 60s"',
      '+tagline = "Ship your site in 5 minutes"',
    ].join("\n"),
  );
  assertEquals(parsed.ok, true);
  if (!parsed.ok) return;
  assertEquals(parsed.hunks, [{
    oldStart: 3,
    oldLines: ['tagline = "Ship your site in 60s"'],
    newLines: ['tagline = "Ship your site in 5 minutes"'],
  }]);
});

Deno.test("parsePatch defaults a bare @@ header to a single line", () => {
  const parsed = parsePatch("@@ -3 +3 @@\n-a\n+b");
  assertEquals(parsed.ok, true);
  if (!parsed.ok) return;
  assertEquals(parsed.hunks[0].oldStart, 3);
});

Deno.test("parsePatch rejects a malformed hunk header", () => {
  const parsed = parsePatch("@@ this is not a header @@\n-a\n+b");
  assertEquals(parsed.ok, false);
  if (parsed.ok) return;
  assertEquals(parsed.reason, "malformed");
});

Deno.test("parsePatch rejects a patch with no hunks", () => {
  const parsed = parsePatch("just some prose, no diff here");
  assertEquals(parsed.ok, false);
  if (parsed.ok) return;
  assertEquals(parsed.reason, "no-hunks");
});

Deno.test("applyPatch applies an exact hunk", () => {
  const result = applyPatch({
    text: canvas,
    patch: [
      "@@ -3,1 +3,1 @@",
      '-tagline = "Ship your site in 60s"',
      '+tagline = "Ship your site in 5 minutes"',
    ].join("\n"),
  });
  assertEquals(result.ok, true);
  if (!result.ok) return;
  assertEquals(result.hunksApplied, 1);
  assertEquals(
    result.text.includes('tagline = "Ship your site in 5 minutes"'),
    true,
  );
  assertEquals(result.text.includes("60s"), false);
});

Deno.test("applyPatch ignores wrong line numbers in the hunk header", () => {
  const patch = [
    "@@ -1,3 +1,3 @@",
    " # Auto landing",
    " ",
    '-tagline = "Ship your site in 60s"',
    '+tagline = "Ship your site in 5 minutes"',
  ].join("\n");
  const wrongNumbers = applyPatch({ text: canvas, patch });
  assertEquals(wrongNumbers.ok, true);

  const nonsenseNumbers = applyPatch({
    text: canvas,
    patch: patch.replace("@@ -1,3 +1,3 @@", "@@ -900,3 +900,3 @@"),
  });
  assertEquals(nonsenseNumbers.ok, true);
  if (!nonsenseNumbers.ok) return;
  assertEquals(nonsenseNumbers.text, wrongNumbers.ok ? wrongNumbers.text : "");
});

Deno.test("applyPatch finds context after an earlier hunk shifted the text", () => {
  const result = applyPatch({
    text: canvas,
    patch: [
      "@@ -1,1 +1,2 @@",
      " # Auto landing",
      "+",
      "+inserted early",
      "@@ -3,1 +4,1 @@",
      '-tagline = "Ship your site in 60s"',
      '+tagline = "changed later"',
    ].join("\n"),
  });
  assertEquals(result.ok, true);
  if (!result.ok) return;
  assertEquals(result.hunksApplied, 2);
  assertEquals(result.text.includes("inserted early"), true);
  assertEquals(result.text.includes('tagline = "changed later"'), true);
});

Deno.test("applyPatch accepts a hunk that trims its context", () => {
  const result = applyPatch({
    text: canvas,
    patch: [
      "@@ -3,1 +3,1 @@",
      '-tagline = "Ship your site in 60s"',
      '+tagline = "trimmed context"',
    ].join("\n"),
  });
  assertEquals(result.ok, true);
  if (!result.ok) return;
  assertEquals(result.text.includes('tagline = "trimmed context"'), true);
});

Deno.test("applyPatch fails with a nearby excerpt when context is missing", () => {
  const result = applyPatch({
    text: canvas,
    patch: [
      "@@ -1,3 +1,3 @@",
      " # a line that does not exist",
      "-neither does this",
      "+replacement",
      " # nor this",
    ].join("\n"),
  });
  assertEquals(result.ok, false);
  if (result.ok) return;
  assertEquals(result.reason, "context-not-found");
  assertEquals(result.hunkIndex, 0);
  assertEquals(typeof result.near, "string");
});

Deno.test("applyPatch inserts after the line a zero-length hunk names", () => {
  const result = applyPatch({
    text: "# Title\n",
    patch: "@@ -1,0 +2,1 @@\n+second line",
  });
  assertEquals(result.ok, true);
  if (!result.ok) return;
  assertEquals(result.text, "# Title\nsecond line\n");
});

Deno.test("applyPatch inserts at the top when the hunk names line zero", () => {
  const result = applyPatch({
    text: "# Title\n",
    patch: "@@ -0,0 +1,1 @@\n+first line",
  });
  assertEquals(result.ok, true);
  if (!result.ok) return;
  assertEquals(result.text, "first line\n# Title\n");
});

Deno.test("applyPatch rejects a result over the length limit", () => {
  const result = applyPatch({
    text: "x",
    patch: `@@ -1,1 +1,1 @@\n-x\n+${"y".repeat(maxCanvasLength + 1)}`,
  });
  assertEquals(result.ok, false);
  if (result.ok) return;
  assertEquals(result.reason, "too-long");
});

Deno.test("applyEdit set replaces the whole canvas", () => {
  const result = applyEdit({
    text: canvas,
    edit: { kind: "set", text: "brand new" },
  });
  assertEquals(result.ok, true);
  if (!result.ok) return;
  assertEquals(result.text, "brand new");
});

Deno.test("applyEdit replace requires a unique match", () => {
  const result = applyEdit({
    text: "one two one",
    edit: { kind: "replace", find: "one", replace: "three" },
  });
  assertEquals(result.ok, false);
  if (result.ok) return;
  assertEquals(result.reason, "ambiguous");
  assertEquals(result.occurrences, 2);
});

Deno.test("applyEdit replace rewrites every occurrence when asked", () => {
  const result = applyEdit({
    text: "one two one",
    edit: { kind: "replace", find: "one", replace: "three", all: true },
  });
  assertEquals(result.ok, true);
  if (!result.ok) return;
  assertEquals(result.text, "three two three");
});

Deno.test("applyEdit replace reports missing text", () => {
  const result = applyEdit({
    text: canvas,
    edit: { kind: "replace", find: "not present anywhere", replace: "x" },
  });
  assertEquals(result.ok, false);
  if (result.ok) return;
  assertEquals(result.reason, "context-not-found");
});

Deno.test("applyEdit replace does not interpolate dollar patterns", () => {
  const result = applyEdit({
    text: "keep this marker",
    edit: { kind: "replace", find: "marker", replace: "$& $' $1" },
  });
  assertEquals(result.ok, true);
  if (!result.ok) return;
  assertEquals(result.text, "keep this $& $' $1");
});

Deno.test("applyEdit rejects an empty find", () => {
  const result = applyEdit({
    text: canvas,
    edit: { kind: "replace", find: "", replace: "x" },
  });
  assertEquals(result.ok, false);
  if (result.ok) return;
  assertEquals(result.reason, "malformed");
});

Deno.test("applyPatch handles a real git diff verbatim", () => {
  const realGitDiff = [
    "diff --git a/f.txt b/f.txt",
    "index 53f1df8..39669e2 100644",
    "--- a/f.txt",
    "+++ b/f.txt",
    "@@ -1,4 +1,5 @@",
    " line one",
    "-line two",
    "+line TWO",
    " line three",
    " line four",
    "+line five",
  ].join("\n");
  const result = applyPatch({
    text: "line one\nline two\nline three\nline four\n",
    patch: realGitDiff,
  });
  assertEquals(result.ok, true);
  if (!result.ok) return;
  assertEquals(
    result.text,
    "line one\nline TWO\nline three\nline four\nline five\n",
  );
});

Deno.test("parsePatch keeps context lines in both the old and new ranges", () => {
  const parsed = parsePatch(
    ["@@ -1,3 +1,3 @@", " keep", "-drop", "+add", " tail"].join("\n"),
  );
  assertEquals(parsed.ok, true);
  if (!parsed.ok) return;
  assertEquals(parsed.hunks[0].oldLines, ["keep", "drop", "tail"]);
  assertEquals(parsed.hunks[0].newLines, ["keep", "add", "tail"]);
});

Deno.test("applyPatch ignores the no-newline marker", () => {
  const result = applyPatch({
    text: "one\ntwo\nthree\nfour",
    patch: [
      "@@ -1,4 +1,4 @@",
      " one",
      " two",
      " three",
      "-four",
      "\\ No newline at end of file",
      "+FOUR",
      "\\ No newline at end of file",
    ].join("\n"),
  });
  assertEquals(result.ok, true);
  if (!result.ok) return;
  assertEquals(result.text, "one\ntwo\nthree\nFOUR");
});

Deno.test("applyPatch leaves the canvas untouched when a hunk fails", () => {
  const result = applyPatch({
    text: canvas,
    patch: [
      "@@ -1,1 +1,1 @@",
      "-# Auto landing",
      "+# Renamed",
      "@@ -1,1 +1,1 @@",
      " # nothing like this exists",
      "+nope",
    ].join("\n"),
  });
  assertEquals(result.ok, false);
});
