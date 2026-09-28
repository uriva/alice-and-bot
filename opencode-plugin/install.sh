#!/bin/bash
set -e

version="v3.6.0"
cacheBuster="$(date +%s)"

echo "Installing Alice&Bot OpenCode plugin ${version} (Idempotent Phone Routing)..."
echo "Cache buster: ${cacheBuster}"

PLUGIN_DIR="$HOME/.config/opencode/plugins/alice-and-bot"
LEGACY_PLUGIN_DIR="$HOME/.config/opencode/plugins/alice"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd || true)"

mkdir -p "$PLUGIN_DIR"
mkdir -p "$HOME/.config/opencode/commands"

cd "$PLUGIN_DIR"

sourceUrl="https://raw.githubusercontent.com/uriva/alice-and-bot/main/opencode-plugin/dist/index.js?t=${cacheBuster}"

if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/dist/index.js" ]; then
  echo "Using local plugin build from $SCRIPT_DIR/dist/index.js..."
  cp "$SCRIPT_DIR/dist/index.js" index.js
elif command -v curl >/dev/null 2>&1; then
  echo "Downloading plugin..."
  echo "Source URL: ${sourceUrl}"
  curl -fsSL "${sourceUrl}" -o index.js
elif command -v wget >/dev/null 2>&1; then
  echo "Downloading plugin..."
  echo "Source URL: ${sourceUrl}"
  wget -qO index.js "${sourceUrl}"
else
  echo "Error: curl or wget is required to download the plugin."
  exit 1
fi

echo "Creating package.json..."
cat << 'PKG' > package.json
{
  "type": "module"
}
PKG

echo "Setting up command macro..."
cat << 'MD' > "$HOME/.config/opencode/commands/aliceandbot.md"
---
description: Connect your phone via Alice&Bot
---
ALICE_AND_BOT_COMMAND_INTERNAL
MD

echo "Updating OpenCode configuration..."
CONFIG_FILE="$HOME/.config/opencode/opencode.json"
if [ ! -f "$CONFIG_FILE" ] && [ -f "$HOME/.config/opencode/opencode.jsonc" ]; then
  CONFIG_FILE="$HOME/.config/opencode/opencode.jsonc"
elif [ ! -f "$CONFIG_FILE" ]; then
  echo "Creating opencode.json..."
  echo '{"$schema": "https://opencode.ai/config.json"}' > "$CONFIG_FILE"
fi

PLUGIN_PATH="$PLUGIN_DIR/index.js"
LEGACY_PLUGIN_PATH="$LEGACY_PLUGIN_DIR/index.js"

export ALICE_CONFIG_FILE="$CONFIG_FILE"
export ALICE_PLUGIN_DIR="$PLUGIN_DIR"
export ALICE_PLUGIN_PATH="$PLUGIN_PATH"
export ALICE_LEGACY_DIR="$LEGACY_PLUGIN_DIR"
export ALICE_LEGACY_PATH="$LEGACY_PLUGIN_PATH"

update_via_js() {
  local runtime="$1"
  "$runtime" -e "
    const fs = require('fs');
    const file = process.env.ALICE_CONFIG_FILE;
    const pluginPath = process.env.ALICE_PLUGIN_PATH;
    const pluginDir = process.env.ALICE_PLUGIN_DIR;
    const legacyDir = process.env.ALICE_LEGACY_DIR;
    const legacyPath = process.env.ALICE_LEGACY_PATH;
    try {
      const raw = fs.readFileSync(file, 'utf8').trim() || '{}';
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        data = eval('(' + raw + ')');
      }
      if (!data || typeof data !== 'object') data = {};
      if (!Array.isArray(data.plugin)) data.plugin = [];
      data.plugin = data.plugin.filter(
        p => p !== pluginDir &&
             p !== pluginPath &&
             p !== legacyDir &&
             p !== legacyPath
      );
      data.plugin.push(pluginPath);
      fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
      console.log('Successfully registered plugin in ' + file);
      process.exit(0);
    } catch (err) {
      console.error('Error updating config:', err.message);
      process.exit(1);
    }
  "
}

update_via_python() {
  python3 -c '
import os, json

config_file = os.environ["ALICE_CONFIG_FILE"]
plugin_path = os.environ["ALICE_PLUGIN_PATH"]
plugin_dir = os.environ["ALICE_PLUGIN_DIR"]
legacy_dir = os.environ["ALICE_LEGACY_DIR"]
legacy_path = os.environ["ALICE_LEGACY_PATH"]

try:
    with open(config_file, "r") as f:
        data = json.load(f)
except Exception:
    data = {}

if not isinstance(data, dict):
    data = {}

plugins = data.get("plugin", [])
if not isinstance(plugins, list):
    plugins = []

plugins = [
    p for p in plugins
    if p not in (plugin_dir, plugin_path, legacy_dir, legacy_path)
]
plugins.append(plugin_path)
data["plugin"] = plugins

with open(config_file, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
print(f"Successfully registered plugin in {config_file}")
'
}

UPDATED=0
if command -v node >/dev/null 2>&1; then
  update_via_js "node" && UPDATED=1
elif command -v bun >/dev/null 2>&1; then
  update_via_js "bun" && UPDATED=1
elif command -v python3 >/dev/null 2>&1; then
  update_via_python && UPDATED=1
fi

if [ "$UPDATED" -ne 1 ]; then
  echo "Warning: Could not automatically update $CONFIG_FILE."
  echo "Please add the following to $CONFIG_FILE:"
  echo "  \"plugin\": [\"$PLUGIN_PATH\"]"
fi

echo ""
echo "Installation complete! Please restart OpenCode to use the /aliceandbot command."
