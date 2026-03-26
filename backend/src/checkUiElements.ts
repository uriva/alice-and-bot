import { query } from "./db.ts";

async function main() {
  const { uiElements } = await query({
    uiElements: {
      conversation: {},
    },
  });
  console.log(JSON.stringify(uiElements, null, 2));
}

main();
