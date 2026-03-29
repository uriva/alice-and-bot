const path = require("path");
const os = require("os");
const pluginPath = path.join(
  os.homedir(),
  ".config",
  "opencode",
  "plugins",
  "alice",
  "index.js",
);

try {
  console.log(`Attempting to require ${pluginPath}...`);
  const plugin = require(pluginPath);
  console.log("Plugin loaded successfully! Exports:", Object.keys(plugin));
  if (typeof plugin.default === "function") {
    console.log("Found default export function");
  } else {
    console.log("WARNING: No default export function found!");
  }
} catch (e) {
  console.error("Failed to load plugin:", e.message);
  console.error(e.stack);
}
