import { assertEquals } from "@std/assert";
import { chatWithMeLink, createIdentity, resolveHandle } from "./clientApi.ts";
import { shortIdLength } from "./shortId.ts";

const chatWithParam = (link: string) => {
  const handle = new URL(link).searchParams.get("chatWith");
  if (!handle) throw new Error("link has no chatWith param");
  return handle;
};

Deno.test("chat invite link handle is short and resolves back to the same identity", async () => {
  const credentials = await createIdentity("link-test");
  const handle = chatWithParam(await chatWithMeLink(credentials.publicSignKey));
  assertEquals(handle.length, shortIdLength);
  const resolved = await resolveHandle(handle);
  if ("error" in resolved) throw new Error(resolved.error);
  assertEquals(resolved.publicSignKey, credentials.publicSignKey);
});

Deno.test("legacy full public key handles still resolve", async () => {
  const credentials = await createIdentity("link-test");
  const resolved = await resolveHandle(credentials.publicSignKey);
  if ("error" in resolved) throw new Error(resolved.error);
  assertEquals(resolved.publicSignKey, credentials.publicSignKey);
});

Deno.test("alias handles resolve with or without @", async () => {
  const alias = `linktest${Math.floor(Math.random() * 1e9)}`;
  const credentials = await createIdentity("link-test", alias);
  for (const handle of [alias, `@${alias}`]) {
    const resolved = await resolveHandle(handle);
    if ("error" in resolved) throw new Error(resolved.error);
    assertEquals(resolved.publicSignKey, credentials.publicSignKey);
  }
});

Deno.test("unknown handle returns no-such-handle", async () => {
  const resolved = await resolveHandle("zzzzzzzzzzzz");
  assertEquals(resolved, { error: "no-such-handle" });
});
