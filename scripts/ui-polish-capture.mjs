import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const base = process.env.AUDIT_BASE_URL ?? "http://127.0.0.1:3000";
const out = process.env.AUDIT_OUTPUT ?? "/opt/cursor/artifacts/screenshots/ui-polish-258e";
await mkdir(out, { recursive: true });

const shots = [
  { name: "dashboard-mobile-dark", route: "/dashboard", w: 390, h: 844, theme: "dark" },
  { name: "dashboard-mobile-light", route: "/dashboard", w: 390, h: 844, theme: "light" },
  { name: "dashboard-desktop-dark", route: "/dashboard", w: 1440, h: 900, theme: "dark" },
  { name: "dashboard-desktop-light", route: "/dashboard", w: 1440, h: 900, theme: "light" },
  { name: "orders-mobile-dark", route: "/orders", w: 390, h: 844, theme: "dark" },
  { name: "orders-desktop-dark", route: "/orders", w: 1440, h: 900, theme: "dark" },
  { name: "leads-mobile-dark", route: "/leads", w: 390, h: 844, theme: "dark" },
  { name: "leads-desktop-dark", route: "/leads", w: 1440, h: 900, theme: "dark" },
  { name: "solutions-mobile-dark", route: "/solutions", w: 390, h: 844, theme: "dark" },
  { name: "settings-mobile-dark", route: "/settings", w: 390, h: 844, theme: "dark" },
  { name: "messages-mobile-dark", route: "/messages", w: 390, h: 844, theme: "dark" },
  { name: "notifications-mobile-dark", route: "/notifications", w: 390, h: 844, theme: "dark" },
  { name: "calendar-mobile-dark", route: "/calendar", w: 390, h: 844, theme: "dark" },
  { name: "analytics-mobile-dark", route: "/analytics", w: 390, h: 844, theme: "dark" },
  { name: "drawer-mobile-dark", route: "/dashboard", w: 390, h: 844, theme: "dark", drawer: true },
];

const browser = await chromium.launch({ headless: true });
const report = [];
try {
  for (const shot of shots) {
    const context = await browser.newContext({
      viewport: { width: shot.w, height: shot.h },
      deviceScaleFactor: 2,
      colorScheme: shot.theme === "dark" ? "dark" : "light",
    });
    const page = await context.newPage();
    await page.addInitScript((theme) => {
      localStorage.setItem("biznesoty.theme", theme);
      document.documentElement.setAttribute("data-theme", theme);
    }, shot.theme);
    const res = await page.goto(base + shot.route, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(400);
    await page.evaluate((theme) => {
      document.documentElement.setAttribute("data-theme", theme);
      localStorage.setItem("biznesoty.theme", theme);
    }, shot.theme);
    await page.waitForTimeout(200);
    if (shot.drawer) {
      const more = page.locator('nav.mobile-bottom-nav button[aria-expanded]');
      if (await more.count()) {
        await more.click();
        await page.waitForTimeout(350);
      }
    }
    const path = `${out}/${shot.name}.png`;
    await page.screenshot({ path, fullPage: true });
    const metrics = await page.evaluate(() => ({
      theme: document.documentElement.getAttribute("data-theme"),
      title: document.title,
      path: location.pathname,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      mainPadBottom: getComputedStyle(document.querySelector(".app-main") || document.body).paddingBottom,
      fieldColor: getComputedStyle(document.querySelector("select,input") || document.body).color,
      fieldBg: getComputedStyle(document.querySelector("select,input") || document.body).backgroundColor,
      switcherExists: !!document.querySelector(".business-switcher__meta"),
    }));
    report.push({
      ...shot,
      status: res?.status() ?? 0,
      path,
      ...metrics,
    });
    await context.close();
  }
} finally {
  await browser.close();
}
await import("node:fs/promises").then(({ writeFile }) =>
  writeFile(`${out}/report.json`, JSON.stringify(report, null, 2)),
);
console.log(JSON.stringify(report, null, 2));
const bad = report.filter((r) => r.status >= 400 || r.overflowX);
if (bad.length) {
  console.error("AUDIT_ISSUES", bad.map((b) => b.name));
  process.exit(1);
}
console.log("AUDIT_OK", report.length);
