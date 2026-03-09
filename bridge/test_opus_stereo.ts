import { Decoder, Encoder } from "@evan/opus";
const enc = new Encoder({ sample_rate: 48000, channels: 2, application: "voip" });

// Create a simple sine wave on Left, zero on Right
const pcmIn = new Int16Array(960 * 2);
for (let i = 0; i < 960; i++) {
  pcmIn[i*2] = Math.sin(i * 0.1) * 10000;
  pcmIn[i*2+1] = 0;
}

const encoded = enc.encode(pcmIn);

const dec1 = new Decoder({ sample_rate: 48000, channels: 1 });
const pcmOut = dec1.decode(encoded);
const pcmOut16 = new Int16Array(pcmOut.buffer, pcmOut.byteOffset, pcmOut.byteLength / 2);

console.log("Input samples:", pcmIn.length);
console.log("Output samples:", pcmOut16.length);

let hasSignal = false;
for(let i=0; i<pcmOut16.length; i++) {
  if (Math.abs(pcmOut16[i]) > 1000) hasSignal = true;
}
console.log("Has signal downmixed:", hasSignal);
