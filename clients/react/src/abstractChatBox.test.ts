import { assertEquals } from "@std/assert";
import {
  decodeHtmlEntities,
  htmlCodeToMarkdown,
  htmlInlineToMarkdown,
} from "./abstractChatBox.tsx";

Deno.test("converts paired <b> to bold markdown", () => {
  assertEquals(htmlInlineToMarkdown("<b>hello</b>"), "**hello**");
});

Deno.test("converts paired <strong> to bold markdown", () => {
  assertEquals(htmlInlineToMarkdown("<strong>hello</strong>"), "**hello**");
});

Deno.test("converts paired <i> to italic markdown", () => {
  assertEquals(htmlInlineToMarkdown("<i>hello</i>"), "*hello*");
});

Deno.test("converts paired <em> to italic markdown", () => {
  assertEquals(htmlInlineToMarkdown("<em>hello</em>"), "*hello*");
});

Deno.test("auto-closes unclosed <b> for streaming", () => {
  assertEquals(htmlInlineToMarkdown("<b>hello"), "**hello**");
});

Deno.test("auto-closes unclosed <i> for streaming", () => {
  assertEquals(htmlInlineToMarkdown("<i>hello"), "*hello*");
});

Deno.test("handles mixed paired and unclosed tags", () => {
  assertEquals(
    htmlInlineToMarkdown("<b>done</b> and <b>streaming"),
    "**done** and **streaming**",
  );
});

Deno.test("handles nested bold and italic", () => {
  assertEquals(
    htmlInlineToMarkdown("<b><i>both</i></b>"),
    "***both***",
  );
});

Deno.test("leaves plain text unchanged", () => {
  assertEquals(htmlInlineToMarkdown("no html here"), "no html here");
});

Deno.test("case insensitive", () => {
  assertEquals(htmlInlineToMarkdown("<B>loud</B>"), "**loud**");
});

Deno.test("does not auto-close empty tag at end of string", () => {
  assertEquals(htmlInlineToMarkdown("text <b>"), "text <b>");
});

Deno.test("converts inline <code> to backtick", () => {
  assertEquals(
    htmlCodeToMarkdown("use <code>foo</code> here"),
    "use `foo` here",
  );
});

Deno.test("converts <pre><code> to fenced block", () => {
  assertEquals(
    htmlCodeToMarkdown("<pre><code>line1\nline2</code></pre>"),
    "```\nline1\nline2\n```",
  );
});

Deno.test("converts <code> with attributes", () => {
  assertEquals(
    htmlCodeToMarkdown('<code class="lang">x</code>'),
    "`x`",
  );
});

Deno.test("decodes &lt; and &gt; to angle brackets", () => {
  assertEquals(decodeHtmlEntities("&lt;script&gt;"), "<script>");
});

Deno.test("decodes &amp; last to avoid double-decode", () => {
  assertEquals(decodeHtmlEntities("&amp;lt;"), "&lt;");
});

Deno.test("decodes &quot; and &#39;", () => {
  assertEquals(decodeHtmlEntities("&quot;hi&#39;"), "\"hi'");
});

Deno.test("leaves plain text unchanged in decodeHtmlEntities", () => {
  assertEquals(decodeHtmlEntities("hello world"), "hello world");
});
