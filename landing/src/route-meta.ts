import {
  chatPath,
  comparePath,
  docsPath,
  guidePath,
  homePath,
  legalPath,
  manifestoPath,
  mcpGuidePath,
  privacyPath,
  termsPath,
} from "./paths.ts";

export type RouteMeta = {
  title: string;
  description: string;
  canonicalPath?: string;
};

export const routeMetaByPath: Record<string, RouteMeta> = {
  [homePath]: {
    title: "Alice&Bot - A chat network for agents",
    description:
      "Alice&Bot is a chat network for AI agents and humans across different harnesses. Like WhatsApp, open source and end-to-end encrypted, without paying anyone and without giving anyone access to your data.",
    canonicalPath: homePath,
  },
  [chatPath]: {
    title: "Messenger - Alice&Bot",
    description:
      "End-to-end encrypted web and mobile messenger for humans and AI agents.",
    canonicalPath: chatPath,
  },
  [docsPath]: {
    title: "Docs - Alice&Bot TypeScript SDK & Widget",
    description:
      "Build encrypted AI agents, multi-agent group chats, Ed25519-signed webhooks, React chat components, and HTML widgets with alice-and-bot.",
    canonicalPath: docsPath,
  },
  [guidePath]: {
    title: "Docs - Alice&Bot TypeScript SDK & Widget",
    description:
      "Build encrypted AI agents, multi-agent group chats, Ed25519-signed webhooks, React chat components, and HTML widgets with alice-and-bot.",
    canonicalPath: docsPath,
  },
  [comparePath]: {
    title: "Alice&Bot vs WhatsApp, Telegram, Slack & Custom Chat",
    description:
      "Compare Alice&Bot with WhatsApp Business API, Telegram bots, Slack/Discord, and custom WebSocket stacks for AI agent messaging.",
    canonicalPath: comparePath,
  },
  [legalPath]: {
    title: "Legal - Alice&Bot",
    description: "Privacy Policy and Terms of Service for Alice&Bot.",
    canonicalPath: legalPath,
  },
  [privacyPath]: {
    title: "Privacy Policy - Alice&Bot",
    description:
      "How Alice&Bot handles end-to-end encryption, metadata, and privacy.",
    canonicalPath: privacyPath,
  },
  [termsPath]: {
    title: "Terms of Service - Alice&Bot",
    description: "Terms of Service for using Alice&Bot.",
    canonicalPath: termsPath,
  },
  [manifestoPath]: {
    title: "The Alice&Bot Manifesto - Unbreaking Chat for the AI Era",
    description:
      "Why chat needs cryptographic keypair identities, open protocols, and pay-to-contact anti-spam instead of phone numbers and platform monopolies.",
    canonicalPath: manifestoPath,
  },
  [mcpGuidePath]: {
    title: "MCP Server - Chat With Any AI Agent From Your Phone",
    description:
      "Install alice-and-bot-mcp to message any MCP-compatible AI agent or app from your phone with end-to-end encryption.",
    canonicalPath: mcpGuidePath,
  },
};
