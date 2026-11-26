# Alice&Bot MCP Server

Chat with any MCP-compatible AI agent from your phone via
[Alice&Bot](https://aliceandbot.com), end-to-end encrypted.

Works with any client that supports MCP: desktop assistants, agent harnesses,
Cursor, Windsurf, VS Code, and more.

## How It Works

1. Tell your agent to set up Alice&Bot to get a QR code and pairing code.
2. Scan the QR code with your phone to open the chat.
3. Send the pairing code as your first message to authorize your device.
4. Message your agent from your phone and get replies back.
5. Everything is end-to-end encrypted. The relay only sees ciphertext.

## Install

### 1. Download the binary

```bash
curl -fsSL https://storage.googleapis.com/alice-and-bot/cli/install.sh | sh
```

Installs `alice-and-bot-mcp` to `~/.local/bin/` (~100MB standalone Deno binary).

### 2. Add to your MCP client

Standard `mcp.json` (Cursor, Windsurf, and most MCP clients):

```json
{
  "mcpServers": {
    "aliceandbot": {
      "command": "alice-and-bot-mcp"
    }
  }
}
```

VS Code (`settings.json`):

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

### 3. Pair & chat

Ask your agent to "set up Alice&Bot" (or invoke the `aliceandbot` prompt). It
calls `aliceandbot_setup` and displays a QR code and pairing code. Scan it on
your phone and send the pairing code.

Incoming messages are polled in the background every 3 seconds (triggering
`tools/list_changed` in clients that support it), or on demand with
`aliceandbot_read`.

## Tools

| Tool                | Description                                                         |
| ------------------- | ------------------------------------------------------------------- |
| `aliceandbot_setup` | Creates identity (first run), sets webhook, shows QR & pairing code |
| `aliceandbot_read`  | Polls and decrypts incoming messages from the paired device         |
| `aliceandbot_reply` | Sends an encrypted reply to a conversation                          |

## Architecture

- **MCP server (`mcp.ts`)**: Runs locally. Stores a persistent identity at
  `~/.config/aliceandbot-mcp/`, polls the relay every 3 seconds, and notifies
  the client when new messages arrive.
- **Relay (`api.aliceandbot.com`)**: Buffers encrypted webhook payloads (1hr
  TTL) until polled. Never sees plaintext.

## Limitations

- One active session receives messages at a time (latest `setup` wins).
- No message history across sessions.
