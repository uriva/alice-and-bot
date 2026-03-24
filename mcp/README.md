# Alice&Bot MCP Server

Chat with your coding sessions from your phone via
[Alice&Bot](https://aliceandbot.com).

Works with any editor that supports MCP: Claude Code, Cursor, Windsurf, VS Code
(Copilot), and others.

## How It Works

```
You (phone)  →  Alice&Bot  →  webhook  →  Relay  →  MCP Server  →  Editor
                                                  ←              ←
```

1. Ask your editor to set up Alice&Bot — you get a QR code
2. Scan it with your phone — opens an Alice&Bot conversation
3. Send messages from your phone — your AI agent sees them and replies
4. End-to-end encrypted. The relay only sees ciphertext.

## Install

### 1. Deploy the relay

The relay is a tiny Deno Deploy service that buffers encrypted webhook payloads.

```bash
cd mcp
deno deploy --entrypoint relay.ts
```

Note the URL (e.g. `https://your-relay.deno.dev`).

### 2. Add the MCP server to your editor

**Claude Code** — add to `.claude/settings.json`:

```json
{
  "mcpServers": {
    "aliceandbot": {
      "command": "deno",
      "args": ["run", "-A", "/path/to/alice-and-bot/mcp/mcp.ts"],
      "env": {
        "ALICEANDBOT_RELAY_URL": "https://your-relay.deno.dev"
      }
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
      "args": ["run", "-A", "/path/to/alice-and-bot/mcp/mcp.ts"],
      "env": {
        "ALICEANDBOT_RELAY_URL": "https://your-relay.deno.dev"
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
| `aliceandbot_check` | Polls relay for new messages, decrypts them               |
| `aliceandbot_reply` | Sends an encrypted reply to a conversation                |

## Architecture

- **MCP server** (`mcp.ts`) — runs locally via your editor's MCP system. Manages
  a persistent A&B identity stored at `~/.config/aliceandbot-mcp/`. Communicates
  with the relay via HTTP.

- **Relay** (`relay.ts`) — deployed to Deno Deploy. Receives A&B webhooks,
  stores encrypted payloads in Deno KV (1hr TTL), serves them when the MCP
  server polls. Never sees plaintext — messages are E2E encrypted.

## Limitations (v0.1)

- One active session at a time receives messages (last session to call `setup`
  wins the webhook)
- Polling is manual — the agent checks when you ask it to
- No message history across sessions
