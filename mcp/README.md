# Alice&Bot MCP Server

Chat with your coding sessions from your phone via
[Alice&Bot](https://aliceandbot.com).

Works with any editor that supports MCP: Claude Code, Cursor, Windsurf, VS Code
(Copilot), and others.

## How It Works

1. Ask your editor to set up Alice&Bot — you get a QR code
2. Scan it with your phone — opens an Alice&Bot conversation
3. Send messages from your phone — your AI agent sees them and replies
4. End-to-end encrypted. The relay only sees ciphertext.

## Install

### 1. Download the binary

```bash
curl -fsSL https://storage.googleapis.com/alice-and-bot/cli/install.sh | sh
```

This installs `alice-and-bot-mcp` to `~/.local/bin/`. No runtime needed.

### 2. Add the MCP server to your editor

**Claude Code** — add to `.claude/settings.json`:

```json
{
  "mcpServers": {
    "aliceandbot": {
      "command": "alice-and-bot-mcp"
    }
  }
}
```

**Cursor / Windsurf** — add to `.cursor/mcp.json` or `.windsurf/mcp.json`:

```json
{
  "mcpServers": {
    "aliceandbot": {
      "command": "alice-and-bot-mcp"
    }
  }
}
```

**VS Code (GitHub Copilot)** — add to your VS Code `settings.json`:

```json
{
  "mcp": {
    "servers": {
      "aliceandbot": {
        "command": "alice-and-bot-mcp"
      }
    }
  }
}
```

### 3. Use it

Ask your AI agent to "set up Alice&Bot" or use the `aliceandbot` prompt. It will
call `aliceandbot_setup` and show you a QR code. Scan it with your phone.

Then ask it to "check for Alice&Bot messages" whenever you want it to poll.

## MCP Tools

| Tool                | Description                                               |
| ------------------- | --------------------------------------------------------- |
| `aliceandbot_setup` | Creates identity (first run), sets webhook, shows QR code |
| `aliceandbot_check` | Polls for new messages, decrypts them                     |
| `aliceandbot_reply` | Sends an encrypted reply to a conversation                |

## Architecture

- **MCP server** (`mcp.ts`) — runs locally via your editor's MCP system. Manages
  a persistent A&B identity stored at `~/.config/aliceandbot-mcp/`. Communicates
  with the relay via HTTP.

- **Relay** — hosted at `api.aliceandbot.com`. Receives A&B webhooks, stores
  encrypted payloads (1hr TTL), serves them when the MCP server polls. Never
  sees plaintext — messages are E2E encrypted.

## Limitations (v0.1)

- One active session at a time receives messages (last session to call `setup`
  wins the webhook)
- Polling is manual — the agent checks when you ask it to
- No message history across sessions
