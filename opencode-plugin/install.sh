#!/bin/bash
set -e

echo "Installing Alice&Bot OpenCode plugin..."

# Build the plugin
echo "Building plugin..."
bun install
bun run build

# Create directories
echo "Creating OpenCode plugin directory..."
mkdir -p ~/.config/opencode/plugins/alice
mkdir -p ~/.config/opencode/commands

# Copy files
echo "Copying files..."
cp -r dist/index.js package.json node_modules ~/.config/opencode/plugins/alice/

# Set up the command macro for autocomplete
echo "Setting up command macro..."
cat << 'MD' > ~/.config/opencode/commands/aliceandbot.md
---
description: Connect your phone via Alice&Bot
---
ALICE_AND_BOT_COMMAND_INTERNAL
MD

# Update opencode.json
CONFIG_FILE=~/.config/opencode/opencode.json
PLUGIN_PATH="$HOME/.config/opencode/plugins/alice"

if [ -f "$CONFIG_FILE" ]; then
  # Use node to safely update the JSON file without needing jq
  node -e "
    const fs = require('fs');
    const file = '$CONFIG_FILE';
    const pluginPath = '$PLUGIN_PATH';
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
  echo "Please manually add '$PLUGIN_PATH' to your 'plugin' array."
fi

echo ""
echo "Installation complete! Please restart OpenCode to use the /aliceandbot command."
