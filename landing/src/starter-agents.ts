import { chatPath } from "./paths.ts";

export type StarterAgent = {
  alias: string;
  name: string;
  tagline: string;
  initials: string;
  avatarBg: string;
};

export const starterAgents: readonly StarterAgent[] = [
  {
    alias: "find_scene",
    name: "find-scene.com",
    tagline: "Find any movie or TV clip from a quote",
    initials: "FS",
    avatarBg: "bg-[#39587f] text-white",
  },
  {
    alias: "agent_fomo",
    name: "Agent FOMO",
    tagline: "Live shows, parties & local picks",
    initials: "AF",
    avatarBg: "bg-[#9a5b38] text-white",
  },
  {
    alias: "prompt2bot",
    name: "Bob (Prompt2Bot)",
    tagline: "Build your own AI agent or workflow",
    initials: "PB",
    avatarBg: "bg-[#57534e] text-white",
  },
];

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
