# Chat With Your Coding Sessions

Talk to your AI code editor from your phone — end-to-end encrypted via
Alice&Bot.

Works with **Claude Code**, **Cursor**, **Windsurf**, **VS Code (Copilot)**, and
any editor that supports [MCP](https://modelcontextprotocol.io/).

## How It Works

Your editor runs a local MCP server that creates an Alice&Bot identity. You scan
a QR code, and you're chatting — encrypted end-to-end.

**Phone** sends a message through **Alice&Bot**, which forwards it to a
**Relay**, which delivers it to the **MCP Server** running in your **Editor** —
and replies flow back the same way. The relay never sees plaintext.

## Step 1: Install the MCP Server

A single command downloads the binary for your platform:

```bash
curl -fsSL https://storage.googleapis.com/alice-and-bot/cli/install.sh | sh
```

This installs `alice-and-bot-mcp` to `~/.local/bin/`.

The binary is ~100MB because Deno embeds its entire runtime — even a hello world
is ~90MB. The actual MCP server code adds very little on top.

## Step 2: Configure Your Editor

Add the MCP server to your editor's configuration.

### Claude Code

Add to `.claude/settings.json` (or ask Claude to add it for you):

```json
{
  "mcpServers": {
    "aliceandbot": {
      "command": "alice-and-bot-mcp"
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "aliceandbot": {
      "command": "alice-and-bot-mcp"
    }
  }
}
```

### Windsurf

Add to `.windsurf/mcp.json`:

```json
{
  "mcpServers": {
    "aliceandbot": {
      "command": "alice-and-bot-mcp"
    }
  }
}
```

### VS Code (GitHub Copilot)

Add to your VS Code `settings.json`:

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

## Step 3: Start Chatting

1. Ask your AI agent to **"set up Alice&Bot"** (or use the `aliceandbot` prompt
   if your editor supports MCP prompts)
2. It will show a **QR code** — scan it with your phone
3. This opens an Alice&Bot conversation — start typing
4. Ask your agent to **"check for Alice&Bot messages"** to see what you sent
5. The agent can reply back to you with **"reply via Alice&Bot"**

That's it. You're chatting with your coding session from your phone, with
end-to-end encryption.

## Available Tools

| Tool                | What it does                                                                   |
| ------------------- | ------------------------------------------------------------------------------ |
| `aliceandbot_setup` | Creates your identity (first run only), sets up the webhook, shows the QR code |
| `aliceandbot_check` | Polls for new messages and decrypts them                                       |
| `aliceandbot_reply` | Sends an encrypted reply back to a conversation                                |

## Notes

- Your identity persists across sessions at `~/.config/aliceandbot-mcp/` — you
  only create it once
- One session at a time receives messages (the last one to call setup wins)
- Polling is manual for now — ask your agent to check when you want updates
- All messages are end-to-end encrypted; the relay only stores ciphertext
