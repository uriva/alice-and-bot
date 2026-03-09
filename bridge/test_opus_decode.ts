import { Decoder, Encoder } from "@evan/opus";
const enc = new Encoder({ sample_rate: 48000, channels: 2, application: "voip" });
const dec1 = new Decoder({ sample_rate: 48000, channels: 1 });
const dec2 = new Decoder({ sample_rate: 48000, channels: 2 });

const pcm = new Int16Array(960 * 2);
pcm[0] = 10000;
pcm[1] = 5000; // Left/Right

const encoded = enc.encode(pcm);
try {
  const decoded1 = dec1.decode(encoded);
  console.log("Mono decode length:", decoded1.length);
} catch(e) { console.log("Mono error", e.message); }

try {
  const decoded2 = dec2.decode(encoded);
  console.log("Stereo decode length:", decoded2.length);
} catch(e) { console.log("Stereo error", e.message); }
