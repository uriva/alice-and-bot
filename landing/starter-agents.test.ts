import { assertEquals } from "@std/assert";
import {
  inviteContextLabel,
  shareOrCopyInviteLink,
  starterAgentHref,
  starterAgents,
} from "./src/starter-agents.ts";

Deno.test("starterAgents have valid aliases and generate /chat?chatWith links", () => {
  assertEquals(starterAgents.length, 3);
  assertEquals(starterAgentHref("find_scene"), "/chat?chatWith=find_scene");
  assertEquals(starterAgentHref("agent_fomo"), "/chat?chatWith=agent_fomo");
});

Deno.test("inviteContextLabel formats known starter agents, handles, and friend invite keys", () => {
  assertEquals(inviteContextLabel(undefined), null);
  assertEquals(
    inviteContextLabel("find_scene"),
    "Encrypted chat with find-scene.com (@find_scene)",
  );
  assertEquals(inviteContextLabel("alice_1"), "Encrypted chat with @alice_1");
  assertEquals(
    inviteContextLabel("BZEQmzKuzzoO"),
    "You were invited to an encrypted chat",
  );
});

Deno.test("shareOrCopyInviteLink prefers native share, ignores cancel, and falls back to clipboard", async () => {
  assertEquals(
    await shareOrCopyInviteLink("https://aliceandbot.com/chat?chatWith=abc", {
      shareFn: () => Promise.resolve(),
      copyFn: () => Promise.resolve(true),
    }),
    "shared",
  );

  const abortErr = new Error("User canceled");
  abortErr.name = "AbortError";
  assertEquals(
    await shareOrCopyInviteLink("https://aliceandbot.com/chat?chatWith=abc", {
      shareFn: () => Promise.reject(abortErr),
      copyFn: () => Promise.resolve(true),
    }),
    "cancelled",
  );

  assertEquals(
    await shareOrCopyInviteLink("https://aliceandbot.com/chat?chatWith=abc", {
      shareFn: () => Promise.reject(new Error("NotAllowedError")),
      copyFn: () => Promise.resolve(true),
    }),
    "copied",
  );

  assertEquals(
    await shareOrCopyInviteLink("https://aliceandbot.com/chat?chatWith=abc", {
      copyFn: () => Promise.resolve(false),
    }),
    "failed",
  );
});
