import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push("[console.error] " + msg.text());
});
page.on("pageerror", (err) => {
  errors.push("[pageerror] " + err.message);
});
await page.goto("http://localhost:3099/", {
  waitUntil: "networkidle",
  timeout: 15000,
});
await page.waitForTimeout(3000);
const _html = await page.content();
const root = await page.evaluate(() =>
  document.getElementById("root")?.innerHTML?.substring(0, 500)
);
console.log("ROOT innerHTML:", root);
console.log("ERRORS:", JSON.stringify(errors, null, 2));
await browser.close();
