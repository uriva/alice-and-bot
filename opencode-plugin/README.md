# Alice&Bot OpenCode Plugin

Connect your phone to OpenCode and chat with your AI assistant on the go.

## Installation

You can install the plugin automatically using the provided script, or manually.

### Automatic Installation

Just run the install script from this directory:

```bash
./install.sh
```

### Manual Installation

1. Install dependencies and build the plugin:

```bash
bun install
bun run build
```

2. Copy the plugin files to your OpenCode config directory:

```bash
mkdir -p ~/.config/opencode/plugins/alice
cp -r dist/index.js package.json node_modules ~/.config/opencode/plugins/alice/
```

3. Register the plugin in `~/.config/opencode/opencode.json`:

```json
{
  "plugin": [
    "/home/YOUR_USERNAME/.config/opencode/plugins/alice"
  ]
}
```

4. Create the custom autocomplete command by adding a markdown file at
   `~/.config/opencode/commands/aliceandbot.md` with the following content:

```markdown
---
description: Connect your phone via Alice&Bot
---

ALICE_AND_BOT_COMMAND_INTERNAL
```

## Usage

1. Open OpenCode CLI.
2. Type `/aliceandbot` (it should appear in your autocomplete menu) and press
   Enter.
3. A connection link will be copied to your clipboard and displayed as a toast
   notification.
4. Send the first message from your phone using the link to initialize the
   session.
