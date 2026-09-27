import { assertEquals } from "@std/assert";

Deno.test("chat-video-player uses downloadMedia for video downloads instead of target _blank anchor", () => {
  const code = Deno.readTextFileSync(
    new URL("./chat-video-player.ts", import.meta.url).pathname,
  );
  assertEquals(code.includes("downloadMedia"), true);
  assertEquals(code.includes('target="_blank"'), false);
});
