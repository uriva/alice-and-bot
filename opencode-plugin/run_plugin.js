import plugin from "./dist/index.js";
import process from "node:process";

const mockClient = {
  session: { prompt: () => {}, abort: () => {} },
  tui: { showToast: (msg) => (console.log("Toast:", msg), Promise.resolve()) },
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
