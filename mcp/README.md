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

### 1. Install Deno

```bash
curl -fsSL https://deno.land/install.sh | sh
```

### 2. Download the MCP server

```bash
mkdir -p ~/.local/share/aliceandbot-mcp && cd ~/.local/share/aliceandbot-mcp
curl -fsSLO https://raw.githubusercontent.com/uriva/alice-and-bot/main/mcp/mcp.ts
curl -fsSLO https://raw.githubusercontent.com/uriva/alice-and-bot/main/mcp/deno.json
```

### 3. Add the MCP server to your editor

**Claude Code** — add to `.claude/settings.json`:

```json
{
  "mcpServers": {
    "aliceandbot": {
      "command": "deno",
      "args": [
        "run",
        "-A",
        "--config",
        "<HOME>/.local/share/aliceandbot-mcp/deno.json",
        "<HOME>/.local/share/aliceandbot-mcp/mcp.ts"
      ]
    }
  }
}
```

**Cursor / Windsurf / VS Code** — add to your MCP config (typically
`.cursor/mcp.json`, `.windsurf/mcp.json`, or VS Code settings):

```json
{
  "mcpServers": {
    "aliceandbot": {
      "command": "deno",
      "args": [
        "run",
        "-A",
        "--config",
        "<HOME>/.local/share/aliceandbot-mcp/deno.json",
        "<HOME>/.local/share/aliceandbot-mcp/mcp.ts"
      ]
    }
  }
}
```

Replace `<HOME>` with your home directory (e.g. `/Users/you` on macOS,
`/home/you` on Linux).

### 4. Use it

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
