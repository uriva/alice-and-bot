#!/bin/bash
set -e

version="v3.5.0"
cacheBuster="$(date +%s)"

echo "Installing Alice&Bot OpenCode plugin ${version} (Phone Command Routing)..."
echo "Cache buster: ${cacheBuster}"

PLUGIN_DIR="$HOME/.config/opencode/plugins/alice-and-bot"
LEGACY_PLUGIN_DIR="$HOME/.config/opencode/plugins/alice"
mkdir -p "$PLUGIN_DIR"
mkdir -p ~/.config/opencode/commands

cd "$PLUGIN_DIR"

echo "Downloading plugin..."
sourceUrl="https://raw.githubusercontent.com/uriva/alice-and-bot/main/opencode-plugin/dist/index.js?t=${cacheBuster}"
echo "Source URL: ${sourceUrl}"
curl -fsSL "${sourceUrl}" -o index.js

echo "Creating package.json..."
cat << 'PKG' > package.json
{
  "type": "module"
}
PKG

echo "Setting up command macro..."
cat << 'MD' > ~/.config/opencode/commands/aliceandbot.md
---
description: Connect your phone via Alice&Bot
---
ALICE_AND_BOT_COMMAND_INTERNAL
MD

echo "Updating opencode.json..."
CONFIG_FILE=~/.config/opencode/opencode.json

# If the config file doesn't exist (fresh install), create a basic one
if [ ! -f "$CONFIG_FILE" ]; then
  echo "Creating opencode.json..."
  echo '{}' > "$CONFIG_FILE"
fi

# Use node to safely update the JSON file without needing jq
node -e "
  const fs = require('fs');
  const file = '$CONFIG_FILE';
  const pluginPath = '$PLUGIN_DIR/index.js';
  const legacyPluginDir = '$LEGACY_PLUGIN_DIR';
  const legacyPluginPath = '$LEGACY_PLUGIN_DIR/index.js';
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data.plugin) data.plugin = [];
    data.plugin = data.plugin.filter(
      p =>
        p !== '$PLUGIN_DIR' &&
        p !== '$PLUGIN_DIR/index.js' &&
        p !== legacyPluginDir &&
        p !== legacyPluginPath,
    );
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

echo ""
echo "Installation complete! Please restart OpenCode to use the /aliceandbot command."
