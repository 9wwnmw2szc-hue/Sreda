import { chromium } from "playwright";
import fs from "fs";

const out = "/opt/cursor/artifacts";
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const sizes = [
  { name: "1440", width: 1440, height: 960 },
  { name: "1280", width: 1280, height: 900 },
  { name: "900", width: 900, height: 1200 },
  { name: "390", width: 390, height: 900 },
];

for (const size of sizes) {
  const page = await browser.newPage({
    viewport: { width: size.width, height: size.height },
  });
  await page.goto("http://localhost:3000/dashboard", {
    waitUntil: "networkidle",
    timeout: 90000,
  });
  await page.waitForTimeout(1400);
  await page.screenshot({
    path: `${out}/stage27_dashboard_${size.name}.png`,
    fullPage: false,
  });
  if (size.name === "1440") {
    await page.screenshot({
      path: `${out}/stage27_dashboard_1440_full.png`,
      fullPage: true,
    });
  }
  await page.close();
  console.log("ok", size.name);
}

await browser.close();
console.log("DONE");
