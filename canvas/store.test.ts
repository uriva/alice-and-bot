import { assertEquals, assertRejects } from "@std/assert";
import {
  encryptSymmetric,
  generateSymmetricKey,
} from "../protocol/src/crypto.ts";
import { canvasEvent, canvasFromRow } from "./store.ts";

Deno.test("canvasFromRow decrypts a row it has the key for", async () => {
  const key = await generateSymmetricKey();
  const encrypted = await encryptSymmetric(key, "hello canvas");
  const canvas = await canvasFromRow({ encrypted, version: 7 }, key);
  assertEquals(canvas, { text: "hello canvas", version: 7 });
});

Deno.test("canvasFromRow yields nothing without a key", async () => {
  const encrypted = await encryptSymmetric(await generateSymmetricKey(), "x");
  assertEquals(
    await canvasFromRow({ encrypted, version: 1 }, undefined),
    undefined,
  );
});

Deno.test("canvasFromRow yields nothing when there is no row", async () => {
  const key = await generateSymmetricKey();
  assertEquals(await canvasFromRow(undefined, key), undefined);
});

Deno.test("canvasFromRow yields nothing for a value that is not an envelope", async () => {
  const key = await generateSymmetricKey();
  assertEquals(
    await canvasFromRow({ encrypted: 42, version: 1 }, key),
    undefined,
  );
  assertEquals(
    await canvasFromRow({ encrypted: null, version: 1 }, key),
    undefined,
  );
});

Deno.test("canvasFromRow rejects the wrong key", async () => {
  const encrypted = await encryptSymmetric(
    await generateSymmetricKey(),
    "secret",
  );
  const wrongKey = await generateSymmetricKey();
  await assertRejects(
    () => canvasFromRow({ encrypted, version: 1 }, wrongKey),
  );
});

Deno.test("canvasEvent pairs an action with its payload", () => {
  assertEquals(canvasEvent("signup", { email: "a@b.c" }), {
    action: "signup",
    data: { email: "a@b.c" },
  });
  assertEquals(canvasEvent("ping", "plain"), { action: "ping", data: "plain" });
});
