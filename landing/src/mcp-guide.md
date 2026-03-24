# Chat With Your Coding Sessions

Talk to your AI code editor from your phone — end-to-end encrypted via
Alice&Bot.

Works with **Claude Code**, **Cursor**, **Windsurf**, **VS Code (Copilot)**, and
any editor that supports [MCP](https://modelcontextprotocol.io/).

## How It Works

Your editor runs a local MCP server that creates an Alice&Bot identity. A
lightweight relay bridges webhooks to the editor. You scan a QR code, and you're
chatting — encrypted end-to-end. The relay never sees plaintext.

```
Phone  →  Alice&Bot  →  Relay  →  MCP Server  →  Editor
                               ←               ←
```

## Step 1: Install Deno

The MCP server runs on [Deno](https://deno.land). If you don't have it:

```bash
curl -fsSL https://deno.land/install.sh | sh
```

## Step 2: Clone the Repo

```bash
git clone https://github.com/uriva/alice-and-bot.git
```

## Step 3: Deploy the Relay

The relay is a tiny service that buffers encrypted webhook payloads. Deploy it
to [Deno Deploy](https://deno.com/deploy):

```bash
cd alice-and-bot/mcp
deno deploy --entrypoint relay.ts
```

Note the URL you get (e.g. `https://your-relay.deno.dev`).

## Step 4: Configure Your Editor

Add the MCP server to your editor's configuration. Replace
`/path/to/alice-and-bot` with the actual path, and use your relay URL.

### Claude Code

Add to `.claude/settings.json`:

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

### Cursor

Add to `.cursor/mcp.json`:

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

### Windsurf

Add to `.windsurf/mcp.json`:

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

### VS Code (GitHub Copilot)

Add to your VS Code `settings.json`:

```json
{
  "mcp": {
    "servers": {
      "aliceandbot": {
        "command": "deno",
        "args": ["run", "-A", "/path/to/alice-and-bot/mcp/mcp.ts"],
        "env": {
          "ALICEANDBOT_RELAY_URL": "https://your-relay.deno.dev"
        }
      }
    }
  }
}
```

## Step 5: Start Chatting

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
| `aliceandbot_check` | Polls the relay for new messages and decrypts them                             |
| `aliceandbot_reply` | Sends an encrypted reply back to a conversation                                |

## Notes

- Your identity persists across sessions at `~/.config/aliceandbot-mcp/` — you
  only create it once
- One session at a time receives messages (the last one to call setup wins)
- Polling is manual for now — ask your agent to check when you want updates
- All messages are end-to-end encrypted; the relay only stores ciphertext
