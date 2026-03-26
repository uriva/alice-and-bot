import QRCode from "qrcode";

async function run() {
  const code = await QRCode.toString("https://example.com", {
    type: "terminal",
    small: true,
  });
  console.log(code);
}
run();
