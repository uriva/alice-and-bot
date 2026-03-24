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

## Step 1: Install Deno

The MCP server runs on [Deno](https://deno.land). If you don't have it:

```bash
curl -fsSL https://deno.land/install.sh | sh
```

## Step 2: Download the MCP Server

No need to clone the full repo — just grab two files:

```bash
mkdir -p ~/.local/share/aliceandbot-mcp && cd ~/.local/share/aliceandbot-mcp
curl -fsSLO https://raw.githubusercontent.com/uriva/alice-and-bot/main/mcp/mcp.ts
curl -fsSLO https://raw.githubusercontent.com/uriva/alice-and-bot/main/mcp/deno.json
```

## Step 3: Configure Your Editor

Add the MCP server to your editor's configuration. Replace `<HOME>` with your
home directory (e.g. `/Users/you` on macOS, `/home/you` on Linux).

### Claude Code

Add to `.claude/settings.json` (or ask Claude to add it for you):

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

### Cursor

Add to `.cursor/mcp.json`:

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

### Windsurf

Add to `.windsurf/mcp.json`:

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

### VS Code (GitHub Copilot)

Add to your VS Code `settings.json`:

```json
{
  "mcp": {
    "servers": {
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
}
```

## Step 4: Start Chatting

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
