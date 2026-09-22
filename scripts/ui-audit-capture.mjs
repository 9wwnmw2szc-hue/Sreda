import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import path from "node:path";

const base = process.env.AUDIT_BASE_URL || "https://web-production-1aace.up.railway.app";
const out = process.env.AUDIT_OUTPUT || "/opt/cursor/artifacts/ui-audit/before";
const phase = process.env.AUDIT_PHASE || "before";
await mkdir(out, { recursive: true });

const viewports = [
  { name: "390", width: 390, height: 844 },
  { name: "320", width: 320, height: 568 },
  { name: "1440", width: 1440, height: 900 },
];
const publicRoutes = ["/register", "/login", "/recover"];
const browser = await chromium.launch({ headless: true });
for (const vp of viewports) {
  for (const theme of ["light"]) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      colorScheme: theme,
    });
    const page = await ctx.newPage();
    for (const route of publicRoutes) {
      await page.goto(base + route, { waitUntil: "networkidle", timeout: 60000 }).catch(() => null);
      await page.waitForTimeout(400);
      const name = `${phase}_${route.replace(/\//g, "_").slice(1) || "home"}_${vp.name}_${theme}.png`;
      await page.screenshot({ path: path.join(out, name), fullPage: false });
    }
    // typed register contrast
    if (vp.name === "390") {
      await page.goto(base + "/register", { waitUntil: "networkidle" });
      await page.waitForTimeout(1500);
      const login = page.locator("#account-login");
      if (await login.count()) {
        await login.fill("contrastcheck");
        await page.screenshot({ path: path.join(out, `${phase}_register_typed_390_light.png`), fullPage: false });
      }
    }
    await ctx.close();
  }
}
await browser.close();
console.log("captured to", out);
