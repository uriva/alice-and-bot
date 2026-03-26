import plugin from "./dist/index.js";
import process from "node:process";
(async () => {
  const p = await plugin({ client: { session: { prompt: () => {} } } });
  const output = { parts: [] };
  await p["command.execute.before"]({ command: "aliceandbot-qr" }, output);
  console.log(output);
  process.exit(0);
})();
