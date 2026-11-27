import { chatPath } from "./paths.ts";

export type StarterAgent = {
  alias: string;
  name: string;
  tagline: string;
  initials: string;
  avatarBg: string;
  avatar?: string;
};

export const starterAgents: readonly StarterAgent[] = [
  {
    alias: "find_scene",
    name: "find-scene.com",
    tagline: "Find any movie or TV clip from a quote",
    initials: "FS",
    avatarBg: "bg-[#39587f] text-white",
    avatar: "https://find-scene.com/favicon.svg",
  },
  {
    alias: "agent_fomo",
    name: "Agent FOMO",
    tagline: "Live shows, parties & local picks",
    initials: "AF",
    avatarBg: "bg-[#9a5b38] text-white",
    avatar: "https://hi.f0mo.com/favicon.svg",
  },
  {
    alias: "prompt2bot",
    name: "Bob (Prompt2Bot)",
    tagline: "Build your own AI agent or workflow",
    initials: "PB",
    avatarBg: "bg-[#57534e] text-white",
    avatar:
      "https://storage.googleapis.com/prompt2bot-chat-images/bob-avatar/78ae4437d9b0161449ff36bf2a95e666ebe5f758b37c00a9a8e8f8078ee2e6a1.png",
  },
];

type HandleResolver = (
  handle: string,
) => Promise<{ publicSignKey: string } | { error: string }>;

type ProfileFetcher = (
  publicSignKey: string,
) => Promise<{ profile: { avatar?: string } | null }>;

const fetchSingleStarterAvatar =
  (resolveHandle: HandleResolver, getProfile: ProfileFetcher) =>
  async ({ alias }: StarterAgent): Promise<[string, string] | null> => {
    const resolved = await resolveHandle(alias).catch(() => null);
    if (!resolved || !("publicSignKey" in resolved)) return null;
    const res = await getProfile(resolved.publicSignKey).catch(() => null);
    const avatar = res?.profile?.avatar?.trim();
    return avatar ? [alias, avatar] : null;
  };

const isAvatarEntry = (
  entry: [string, string] | null,
): entry is [string, string] => entry !== null;

export const fetchStarterAgentAvatars = async (
  agents: readonly StarterAgent[],
  {
    resolveHandle,
    getProfile,
  }: { resolveHandle: HandleResolver; getProfile: ProfileFetcher },
): Promise<Map<string, string>> =>
  new Map(
    (await Promise.all(
      agents.map(fetchSingleStarterAvatar(resolveHandle, getProfile)),
    )).filter(isAvatarEntry),
  );

export const resolveStarterAgentAvatar = (
  agent: StarterAgent,
  profileAvatars: ReadonlyMap<string, string>,
  failedUrls: ReadonlySet<string>,
): string | null => {
  const liveAvatar = profileAvatars.get(agent.alias)?.trim();
  if (liveAvatar && !failedUrls.has(liveAvatar)) return liveAvatar;
  const fallbackAvatar = agent.avatar?.trim();
  if (fallbackAvatar && !failedUrls.has(fallbackAvatar)) return fallbackAvatar;
  return null;
};

export const starterAgentHref = (alias: string) =>
  `${chatPath}?chatWith=${encodeURIComponent(alias)}`;

export const inviteContextLabel = (chatWith?: string): string | null => {
  const value = chatWith?.trim();
  if (!value) return null;
  const known = starterAgents.find((a) => a.alias === value.replace(/^@/, ""));
  if (known) return `Encrypted chat with ${known.name} (@${known.alias})`;
  if (/^@?[a-z0-9_]{1,15}$/.test(value)) {
    return `Encrypted chat with @${value.replace(/^@/, "")}`;
  }
  return "You were invited to an encrypted chat";
};

export type ShareInviteResult = "shared" | "copied" | "cancelled" | "failed";

export const shareOrCopyInviteLink = async (
  url: string,
  {
    shareFn,
    copyFn,
  }: {
    shareFn?: (
      data: { title: string; text: string; url: string },
    ) => Promise<void>;
    copyFn: (text: string) => Promise<boolean>;
  },
): Promise<ShareInviteResult> => {
  if (shareFn) {
    try {
      await shareFn({
        title: "Chat with me on Alice&Bot",
        text: "Message me on Alice&Bot (end-to-end encrypted, no signup):",
        url,
      });
      return "shared";
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return "cancelled";
      }
    }
  }
  return (await copyFn(url)) ? "copied" : "failed";
};
