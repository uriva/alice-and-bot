import path from "path";
import os from "os";
import { pathToFileURL } from "url";

const pluginPath = path.join(
  os.homedir(),
  ".config",
  "opencode",
  "plugins",
  "alice",
  "index.js",
);
const pluginUrl = pathToFileURL(pluginPath).href;

console.log(`Attempting to import ${pluginUrl}...`);

try {
  const plugin = await import(pluginUrl);
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
