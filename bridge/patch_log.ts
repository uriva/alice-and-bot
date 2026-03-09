const text = await Deno.readTextFile("main.ts");
const newText = text.replace(
  `const pcmBytes = decoder.decode(rtp.payload);`,
  `const pcmBytes = decoder.decode(rtp.payload);
            if (Math.random() < 0.05) console.log("Decoded PCM bytes length:", pcmBytes.length);`
);
await Deno.writeTextFile("main.ts", newText);
