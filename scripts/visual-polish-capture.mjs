import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const base =
  process.env.AUDIT_BASE_URL ?? "https://web-production-1aace.up.railway.app";
const out =
  process.env.AUDIT_OUTPUT ??
  "/opt/cursor/artifacts/screenshots/visual-polish-258e";
const username = process.env.AUDIT_USER ?? "smoke685410";
const password = process.env.AUDIT_PASS ?? "SmokeTest2026!Aa";

await mkdir(out, { recursive: true });

const shots = [
  { name: "dashboard-mobile-dark", route: "/dashboard", w: 390, h: 844, theme: "dark" },
  { name: "orders-mobile-dark", route: "/orders", w: 390, h: 844, theme: "dark" },
  { name: "leads-mobile-dark", route: "/leads", w: 390, h: 844, theme: "dark" },
  { name: "messages-mobile-dark", route: "/messages", w: 390, h: 844, theme: "dark" },
  { name: "notifications-mobile-dark", route: "/notifications", w: 390, h: 844, theme: "dark" },
  {
    name: "drawer-mobile-dark",
    route: "/dashboard",
    w: 390,
    h: 844,
    theme: "dark",
    drawer: true,
  },
  { name: "dashboard-desktop-dark", route: "/dashboard", w: 1440, h: 900, theme: "dark" },
  { name: "dashboard-desktop-light", route: "/dashboard", w: 1440, h: 900, theme: "light" },
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
    throw new Error(`sign-in failed: ${signIn.status()} ${await signIn.text()}`);
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
    await page.waitForTimeout(500);
    await page.evaluate((theme) => {
      document.documentElement.setAttribute("data-theme", theme);
      localStorage.setItem("soty.theme", theme);
    }, shot.theme);
    await page.waitForTimeout(250);
    if (shot.drawer) {
      const more = page.locator("nav.mobile-bottom-nav button[aria-expanded]");
      if (await more.count()) {
        await more.first().click();
        await page.waitForTimeout(400);
      }
    }
    const path = `${out}/${shot.name}.png`;
    await page.screenshot({ path, fullPage: false });
    report.push({
      ...shot,
      status: res?.status() ?? 0,
      path,
      url: page.url(),
      themeAttr: await page.evaluate(() =>
        document.documentElement.getAttribute("data-theme"),
      ),
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
const bad = report.filter((r) => r.status >= 400 || /\/login/.test(r.url));
if (bad.length) {
  console.error("CAPTURE_ISSUES", bad.map((b) => b.name));
  process.exit(1);
}
console.log("CAPTURE_OK", out);
