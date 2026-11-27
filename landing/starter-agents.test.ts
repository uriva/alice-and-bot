import { assert, assertEquals } from "@std/assert";
import { getProfile, resolveHandle } from "../protocol/src/clientApi.ts";
import {
  fetchStarterAgentAvatars,
  inviteContextLabel,
  resolveStarterAgentAvatar,
  shareOrCopyInviteLink,
  starterAgentHref,
  starterAgents,
} from "./src/starter-agents.ts";

Deno.test("starterAgents have valid aliases, avatar URLs, and generate /chat?chatWith links", () => {
  assertEquals(starterAgents.length, 3);
  starterAgents.forEach((agent) => {
    assert(
      agent.avatar?.startsWith("https://"),
      `Expected https avatar URL for @${agent.alias}`,
    );
  });
  assertEquals(starterAgentHref("find_scene"), "/chat?chatWith=find_scene");
  assertEquals(starterAgentHref("agent_fomo"), "/chat?chatWith=agent_fomo");
});

Deno.test("resolveStarterAgentAvatar prefers live profile avatar, falls back to default, then null on error", () => {
  const agent = starterAgents[0];
  const liveUrl = "https://example.com/live-avatar.png";
  assertEquals(
    resolveStarterAgentAvatar(
      agent,
      new Map([[agent.alias, liveUrl]]),
      new Set(),
    ),
    liveUrl,
  );
  assertEquals(
    resolveStarterAgentAvatar(
      agent,
      new Map([[agent.alias, liveUrl]]),
      new Set([liveUrl]),
    ),
    agent.avatar ?? null,
  );
  assertEquals(
    resolveStarterAgentAvatar(
      agent,
      new Map(),
      new Set(agent.avatar ? [agent.avatar] : []),
    ),
    null,
  );
});

Deno.test("fetchStarterAgentAvatars resolves live Alice&Bot profile avatars", async () => {
  const avatars = await fetchStarterAgentAvatars(starterAgents, {
    resolveHandle,
    getProfile,
  });
  assert(
    avatars.get("find_scene")?.startsWith("https://"),
    "Expected live avatar for @find_scene",
  );
  assert(
    avatars.get("prompt2bot")?.startsWith("https://"),
    "Expected live avatar for @prompt2bot",
  );
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
