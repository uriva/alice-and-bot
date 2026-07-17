import { assertEquals, assertStringIncludes } from "@std/assert";
import { blurSecretsInHtml } from "./secrets.ts";
import { renderMarkdown } from "./markdown.ts";

const fakeToken = ["Z9x", "Q12pLm3n", "OpQrStUv", "WxYz0123", "456789Ab"].join(
  "",
);

Deno.test("blurSecretsInHtml wraps a high-entropy token with a blur span", () => {
  const result = blurSecretsInHtml(`here is a token ${fakeToken} ok`);
  assertStringIncludes(result, 'class="secret-blur"');
  assertStringIncludes(result, 'class="secret-hidden"');
});

Deno.test("blurSecretsInHtml shows the prefix and hides the rest", () => {
  const result = blurSecretsInHtml(fakeToken);
  assertStringIncludes(
    result,
    `<span class="secret-prefix">${fakeToken.slice(0, 4)}</span>`,
  );
  assertStringIncludes(
    result,
    `<span class="secret-hidden">${fakeToken.slice(4)}</span>`,
  );
});

Deno.test("blurSecretsInHtml preserves the whole secret value for reveal", () => {
  const result = blurSecretsInHtml(fakeToken);
  const revealed = result.replace(/<[^>]+>/g, "");
  assertStringIncludes(revealed, fakeToken);
});

Deno.test("blurSecretsInHtml does not touch normal text", () => {
  const text = "hello world this is a normal message";
  assertEquals(blurSecretsInHtml(text), text);
});

Deno.test("blurSecretsInHtml does not blur site:https://google.com", () => {
  const text = "site:https://google.com";
  assertEquals(blurSecretsInHtml(text), text);
  const textLong = "site:https://google.com/foo/bar/baz/qux";
  assertEquals(blurSecretsInHtml(textLong), textLong);
});

Deno.test("blurSecretsInHtml does not corrupt html tags/attributes", () => {
  const html = '<a href="https://example.com/x" style="color:#222">link</a>';
  assertEquals(blurSecretsInHtml(html), html);
});

Deno.test("renderMarkdown blurs a token inside a fenced code block", () => {
  const html = renderMarkdown("```\n" + fakeToken + "\n```", "#222", false);
  assertStringIncludes(html, 'class="secret-blur"');
});

Deno.test("renderMarkdown blurs a token in inline code", () => {
  const html = renderMarkdown("my key `" + fakeToken + "`", "#222", false);
  assertStringIncludes(html, 'class="secret-blur"');
});
