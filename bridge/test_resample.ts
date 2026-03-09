const pcm = new Int16Array([1000, 2000, 3000, 4000, 5000, 6000]);
const outLength = Math.floor(pcm.length / 3);
const resampled = new Int16Array(outLength);
for (let i = 0; i < outLength; i++) {
  resampled[i] = pcm[i * 3];
}
console.log(resampled);

// Let's test the base64 output
const base64 = btoa(String.fromCharCode(...new Uint8Array(resampled.buffer)));
console.log(base64);

const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
const decoded = new Int16Array(bytes.buffer);
console.log(decoded);
