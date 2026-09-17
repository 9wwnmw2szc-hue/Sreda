import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.AUDIT_BASE_URL ?? "http://127.0.0.1:3000";
const output = process.env.AUDIT_OUTPUT ?? "/tmp/sreda-responsive-audit";
const storageState = process.env.AUDIT_STORAGE_STATE;
const sizes = [390, 768, 1280, 1440];
const routes = [
  "/dashboard",
  "/clients",
  "/leads",
  "/messages",
  "/bookings",
  "/posts",
  "/connections",
  "/settings",
  "/solutions",
  "/notifications",
  "/solutions/leads/setup",
  "/login",
  "/register",
  "/recover",
];

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const width of sizes) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      ...(storageState ? { storageState } : {}),
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });
    for (const route of routes) {
      errors.length = 0;
      const response = await page.goto(baseUrl + route, {
        waitUntil: "networkidle",
        timeout: 60_000,
      });
      await page.waitForTimeout(150);
      const metrics = await page.evaluate(() => ({
        title: document.title,
        pathname: location.pathname,
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        overflowX:
          document.documentElement.scrollWidth >
            document.documentElement.clientWidth + 1 ||
          document.body.scrollWidth > document.documentElement.clientWidth + 1,
      }));
      const status = response?.status() ?? 0;
      const result = { width, route, status, errors: [...errors], ...metrics };
      results.push(result);
      if (["/clients", "/messages", "/bookings", "/posts"].includes(route))
        await page.screenshot({
          path: `${output}/${route.slice(1)}-${width}.png`,
          fullPage: true,
        });
    }
    await context.close();
  }
} finally {
  await browser.close();
}
await writeFile(`${output}/report.json`, JSON.stringify(results, null, 2));
const failures = results.filter(
  (result) =>
    result.status >= 400 ||
    result.pathname !== result.route ||
    result.overflowX ||
    result.errors.length,
);
console.log(
  JSON.stringify(
    { checked: results.length, failures: failures.length, output, details: failures },
    null,
    2,
  ),
);
if (failures.length) process.exitCode = 1;
