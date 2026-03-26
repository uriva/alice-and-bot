#!/bin/bash
set -e

echo "Installing Alice&Bot OpenCode plugin..."

PLUGIN_DIR="$HOME/.config/opencode/plugins/alice"
mkdir -p "$PLUGIN_DIR"
mkdir -p ~/.config/opencode/commands

cd "$PLUGIN_DIR"

echo "Downloading plugin source..."
curl -fsSL https://raw.githubusercontent.com/uriva/alice-and-bot/main/opencode-plugin/package.json -o package.json
curl -fsSL https://raw.githubusercontent.com/uriva/alice-and-bot/main/opencode-plugin/index.ts -o index.ts
curl -fsSL https://raw.githubusercontent.com/uriva/alice-and-bot/main/opencode-plugin/tunnel.ts -o tunnel.ts

echo "Installing dependencies..."
if command -v bun &> /dev/null; then
    bun install
    echo "Building plugin..."
    bun build index.ts --target=node --outfile=index.js
elif command -v npm &> /dev/null; then
    npm install
    echo "Building plugin..."
    npx esbuild index.ts --bundle --platform=node --outfile=index.js
else
    echo "Error: Need 'bun' or 'npm' installed to build the plugin."
    exit 1
fi

echo "Setting up command macro..."
cat << 'MD' > ~/.config/opencode/commands/aliceandbot.md
---
description: Connect your phone via Alice&Bot
---
ALICE_AND_BOT_COMMAND_INTERNAL
MD

echo "Updating opencode.json..."
CONFIG_FILE=~/.config/opencode/opencode.json

if [ -f "$CONFIG_FILE" ]; then
  # Use node to safely update the JSON file without needing jq
  node -e "
    const fs = require('fs');
    const file = '$CONFIG_FILE';
    const pluginPath = '$PLUGIN_DIR';
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!data.plugin) data.plugin = [];
      if (!data.plugin.includes(pluginPath)) {
        data.plugin.push(pluginPath);
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
        console.log('Successfully registered plugin in opencode.json');
      } else {
        console.log('Plugin already registered in opencode.json');
      }
    } catch (err) {
      console.error('Error updating opencode.json:', err.message);
    }
  "
else
  echo "Warning: ~/.config/opencode/opencode.json not found."
  echo "Please manually add '$PLUGIN_DIR' to your 'plugin' array."
fi

echo ""
echo "Installation complete! Please restart OpenCode to use the /aliceandbot command."
