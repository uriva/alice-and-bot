import { Buffer } from "node:buffer";

const db = Buffer.alloc(100);
for (let i = 0; i < 100; i++) db[i] = i;

const pcmBytes = db.slice(10, 20); // Length 10, offset 10

const pcm = new Int16Array(
  pcmBytes.buffer,
  pcmBytes.byteOffset,
  pcmBytes.byteLength / 2
);

console.log(pcm.length);
console.log(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength));
