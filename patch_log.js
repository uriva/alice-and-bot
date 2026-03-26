const fs = require("fs");
let hooks = fs.readFileSync("clients/react/src/hooks.ts", "utf8");
hooks = hooks.replace(
  `room.useTopicEffect("stream", (event: EphemeralStreamEvent) => {`,
  `room.useTopicEffect("stream", (event: EphemeralStreamEvent) => {
    console.log("Received stream event:", event);`,
);
fs.writeFileSync("clients/react/src/hooks.ts", hooks);
