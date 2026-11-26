# Chat With Any AI Agent From Your Phone

Message any MCP-compatible agent, app, or editor from your phone, end-to-end
encrypted via Alice&Bot.

Works with any client that supports [MCP](https://modelcontextprotocol.io/),
including desktop assistants, agent harnesses, Cursor, Windsurf, and VS Code.

## How It Works

Your MCP client runs a local server with its own Alice&Bot keypair. Scan a QR
code, send a one-time pairing code to authorize your phone, and start chatting.

**Phone** -> **Alice&Bot** -> **Relay** -> **Local MCP Server** (and back). The
relay only sees ciphertext.

## Step 1: Install

```bash
curl -fsSL https://storage.googleapis.com/alice-and-bot/cli/install.sh | sh
```

Installs `alice-and-bot-mcp` to `~/.local/bin/`.

The binary is ~100MB because Deno embeds its runtime.

## Step 2: Add to Your MCP Client

### Standard MCP config (`mcp.json`)

Works with Cursor (`.cursor/mcp.json`), Windsurf (`.windsurf/mcp.json`), and
most MCP clients:

```json
{
  "mcpServers": {
    "aliceandbot": {
      "command": "alice-and-bot-mcp"
    }
  }
}
```

### VS Code

Add to `settings.json`:

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

## Step 3: Pair & Chat

1. Tell your agent to **"set up Alice&Bot"** (or run the `aliceandbot` prompt).
2. Scan the **QR code** with your phone.
3. Send the **pairing code** as your first message to authorize your device.
4. Message your agent from your phone. It reads messages with `aliceandbot_read`
   (or automatically via `tools/list_changed`) and replies with
   `aliceandbot_reply`.

## Tools

| Tool                | What it does                                                        |
| ------------------- | ------------------------------------------------------------------- |
| `aliceandbot_setup` | Creates identity (first run), sets webhook, shows QR & pairing code |
| `aliceandbot_read`  | Polls and decrypts incoming messages from your paired device        |
| `aliceandbot_reply` | Sends an encrypted reply back to the conversation                   |

## Notes

- Your identity and paired device are saved at `~/.config/aliceandbot-mcp/` so
  you only pair once.
- One active session receives messages at a time (the latest `setup` wins).
- Background polling runs every 3 seconds, plus on demand in `aliceandbot_read`.
- Everything is end-to-end encrypted. The relay only stores ciphertext.
