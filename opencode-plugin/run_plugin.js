import plugin from "./dist/index.js";
import process from "node:process";

const mockClient = {
  session: {
    prompt: (msg) => (console.log("Prompt:", msg), Promise.resolve()),
    command: (msg) => (console.log("Command:", msg), Promise.resolve()),
    abort: (msg) => (console.log("Abort:", msg), Promise.resolve()),
    get: () => Promise.resolve({ data: { info: { title: "Mock Session" } } }),
  },
  tui: {
    showToast: (msg) => (console.log("Toast:", msg), Promise.resolve()),
    openModels: () => (console.log("Open models"), Promise.resolve()),
    openSessions: () => (console.log("Open sessions"), Promise.resolve()),
    openThemes: () => (console.log("Open themes"), Promise.resolve()),
    openHelp: () => (console.log("Open help"), Promise.resolve()),
    executeCommand: (
      msg,
    ) => (console.log("Execute TUI command:", msg), Promise.resolve()),
  },
};
const hooks = await plugin({ client: mockClient });

console.log("Hooks:", Object.keys(hooks));

await hooks.event({
  event: {
    type: "tui.command.execute",
    properties: { command: "/aliceandbot" },
  },
});

process.exit(0);
