import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const base =
  process.env.AUDIT_BASE_URL ?? "https://web-production-1aace.up.railway.app";
const out =
  process.env.AUDIT_OUTPUT ??
  "/opt/cursor/artifacts/screenshots/visual-audit";
const username = process.env.AUDIT_USER;
const password = process.env.AUDIT_PASS;

if (!username || !password) {
  console.error("Missing AUDIT_USER / AUDIT_PASS");
  process.exit(1);
}

await mkdir(out, { recursive: true });

const shots = [
  { name: "dashboard-mobile-dark", route: "/dashboard", w: 390, h: 844, theme: "dark" },
  { name: "dashboard-mobile-light", route: "/dashboard", w: 390, h: 844, theme: "light" },
  { name: "dashboard-desktop-dark", route: "/dashboard", w: 1440, h: 900, theme: "dark" },
  { name: "dashboard-desktop-light", route: "/dashboard", w: 1440, h: 900, theme: "light" },
  { name: "orders-mobile-dark", route: "/orders", w: 390, h: 844, theme: "dark" },
  { name: "leads-mobile-dark", route: "/leads", w: 390, h: 844, theme: "dark" },
  { name: "messages-mobile-dark", route: "/messages", w: 390, h: 844, theme: "dark" },
  { name: "notifications-mobile-dark", route: "/notifications", w: 390, h: 844, theme: "dark" },
  { name: "bookings-mobile-dark", route: "/bookings", w: 390, h: 844, theme: "dark" },
  { name: "solutions-mobile-dark", route: "/solutions", w: 390, h: 844, theme: "dark" },
  { name: "analytics-mobile-dark", route: "/analytics", w: 390, h: 844, theme: "dark" },
  {
    name: "drawer-mobile-dark",
    route: "/dashboard",
    w: 390,
    h: 844,
    theme: "dark",
    drawer: true,
  },
];

const browser = await chromium.launch({ headless: true });
const report = [];

try {
  const login = await browser.newContext();
  const loginPage = await login.newPage();
  await loginPage.goto(base + "/login", { waitUntil: "domcontentloaded" });
  const signIn = await loginPage.request.post(base + "/api/auth/sign-in/username", {
    data: { username, password },
    headers: { origin: base, "content-type": "application/json" },
  });
  if (!signIn.ok()) {
    throw new Error(`sign-in failed: ${signIn.status()}`);
  }
  const storage = await login.storageState();
  await login.close();

  for (const shot of shots) {
    const context = await browser.newContext({
      viewport: { width: shot.w, height: shot.h },
      deviceScaleFactor: 2,
      colorScheme: shot.theme === "dark" ? "dark" : "light",
      storageState: storage,
    });
    const page = await context.newPage();
    await page.addInitScript((theme) => {
      localStorage.setItem("soty.theme", theme);
      document.documentElement.setAttribute("data-theme", theme);
    }, shot.theme);
    const res = await page.goto(base + shot.route, {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    await page.waitForTimeout(400);
    await page.evaluate((theme) => {
      document.documentElement.setAttribute("data-theme", theme);
      localStorage.setItem("soty.theme", theme);
    }, shot.theme);
    await page.waitForTimeout(200);
    if (shot.drawer) {
      const more = page.locator("nav.mobile-bottom-nav button[aria-expanded]");
      if (await more.count()) {
        await more.first().click();
        await page.waitForTimeout(350);
      }
    }
    const file = `${shot.name}.png`;
    const path = `${out}/${file}`;
    await page.screenshot({ path, fullPage: false });
    const overflowX = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth + 1,
    );
    report.push({
      route: shot.route,
      viewport: { width: shot.w, height: shot.h },
      theme: shot.theme,
      status: res?.status() ?? 0,
      url: page.url(),
      overflowX,
      screenshot: file,
    });
    await context.close();
  }
} finally {
  await browser.close();
}

await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: true, count: report.length, out }, null, 2));

const bad = report.filter(
  (r) => r.status >= 400 || /\/login/.test(r.url) || r.overflowX,
);
if (bad.length) {
  console.error(
    "CAPTURE_ISSUES",
    bad.map((b) => ({
      screenshot: b.screenshot,
      status: b.status,
      login: /\/login/.test(b.url),
      overflowX: b.overflowX,
    })),
  );
  process.exit(1);
}
console.log("CAPTURE_OK");
