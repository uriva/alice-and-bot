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

This installs `alice-and-bot-mcp` to `~/.local/bin/`.

The binary is ~100MB because Deno embeds its entire runtime — even a hello world
is ~90MB. The actual MCP server code adds very little on top.

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

Messages arrive automatically — the MCP server polls in the background and
notifies your editor when new messages come in. A dynamic `aliceandbot_read`
tool appears in the tool list so the agent can read them.

## MCP Tools

| Tool                | Description                                                   |
| ------------------- | ------------------------------------------------------------- |
| `aliceandbot_setup` | Creates identity (first run), sets webhook, shows QR code     |
| `aliceandbot_read`  | Reads new messages (appears dynamically when messages arrive) |
| `aliceandbot_reply` | Sends an encrypted reply to a conversation                    |

## Architecture

- **MCP server** (`mcp.ts`) — runs locally via your editor's MCP system. Manages
  a persistent A&B identity stored at `~/.config/aliceandbot-mcp/`. After setup,
  polls the relay every 3 seconds in the background. When messages arrive, sends
  a `tools/list_changed` notification so the editor discovers the new
  `aliceandbot_read` tool.

- **Relay** — hosted at `api.aliceandbot.com`. Receives A&B webhooks, stores
  encrypted payloads (1hr TTL), serves them when the MCP server polls. Never
  sees plaintext — messages are E2E encrypted.

## Limitations (v0.2)

- One active session at a time receives messages (last session to call `setup`
  wins the webhook)
- No message history across sessions
