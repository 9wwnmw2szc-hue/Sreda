import { chromium } from "playwright";
const base = "https://web-production-1aace.up.railway.app";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push("console:" + msg.text());
});
const responses = [];
page.on("response", (r) => {
  if (r.url().includes("/api/")) responses.push(r.status() + " " + r.url());
});
await page.goto(base + "/register", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(2000);
const hydrated = await page.evaluate(() => {
  const form = document.querySelector("form");
  const reactProps = form && Object.keys(form).some((k) => k.startsWith("__react"));
  return { hasForm: !!form, reactProps };
});
console.log("hydrated", hydrated);
console.log("errors before", errors);
const user = "dbg" + Date.now().toString(36).slice(-6);
await page.locator("#account-login").fill(user);
await page.locator("#account-password").fill("AcceptTest!2026ux");
await page.locator("#account-confirmation").fill("AcceptTest!2026ux");
console.log("filled", user, "values", await page.locator("#account-login").inputValue());
await page.getByRole("button", { name: /создать аккаунт/i }).click();
await page.waitForTimeout(8000);
console.log("url", page.url());
console.log("recovery", await page.locator("label.recovery-confirm").count());
console.log("errors after", errors);
console.log("api", responses);
console.log("h2", await page.locator("h2").allTextContents());
console.log("alert", await page.locator(".account-error, [role=alert]").allTextContents());
await page.screenshot({ path: "/opt/cursor/artifacts/screenshots/reg-debug.png", fullPage: true });
await browser.close();
