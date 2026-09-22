/**
 * Canonical screenshot / visual audit pipeline for «Соты».
 *
 * Creates a throwaway account via /register (no AUDIT_USER/AUDIT_PASS required),
 * then captures authenticated + public routes across viewports and themes.
 *
 * Env:
 *   AUDIT_BASE_URL   default https://web-production-1aace.up.railway.app
 *   AUDIT_OUTPUT     default artifacts/visual-audit
 *   AUDIT_PHASE      filename prefix (default "shot")
 *   AUDIT_USER / AUDIT_PASS  optional existing account (skips registration)
 *
 * Exit 1 if:
 *   - registration / sign-in fails (product regression, not "skip")
 *   - protected route redirects to /login
 *   - body horizontal overflow
 *   - zero PNGs written
 */
import { mkdir, writeFile, readdir } from "node:fs/promises";
import { chromium } from "playwright";
import path from "node:path";

const base =
  process.env.AUDIT_BASE_URL || "https://web-production-1aace.up.railway.app";
const out = process.env.AUDIT_OUTPUT || "artifacts/visual-audit";
const phase = process.env.AUDIT_PHASE || "shot";
const existingUser = process.env.AUDIT_USER || "";
const existingPass = process.env.AUDIT_PASS || "";

await mkdir(out, { recursive: true });

const VIEWPORTS = [
  { name: "320", width: 320, height: 568 },
  { name: "390", width: 390, height: 844 },
  { name: "430", width: 430, height: 932 },
  { name: "820", width: 820, height: 1180 },
  { name: "1440", width: 1440, height: 900 },
];

const PUBLIC_ROUTES = ["/login", "/register", "/recover"];

const AUTH_ROUTES = [
  "/dashboard",
  "/solutions",
  "/orders",
  "/leads",
  "/bookings",
  "/messages",
  "/clients",
  "/posts",
  "/connections",
  "/analytics",
  "/notifications",
  "/settings?section=business",
  "/settings?section=account",
  "/settings?section=ai",
  "/settings?section=danger",
];

/** Key pages get light+dark; others light-only to bound artifact size. */
const DARK_ROUTES = new Set([
  "/dashboard",
  "/solutions",
  "/orders",
  "/leads",
  "/bookings",
  "/messages",
  "/connections",
  "/analytics",
  "/settings?section=business",
  "/settings?section=account",
  "/login",
  "/register",
]);

function routeSlug(route) {
  return route
    .replace(/^\//, "")
    .replace(/\?/g, "_")
    .replace(/=/g, "-")
    .replace(/\//g, "_") || "home";
}

function themesFor(route) {
  return DARK_ROUTES.has(route) ? ["light", "dark"] : ["light"];
}

async function bodyOverflowX(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    return (
      doc.scrollWidth > doc.clientWidth + 1 ||
      (body != null && body.scrollWidth > doc.clientWidth + 1)
    );
  });
}

async function applyTheme(page, theme) {
  await page.addInitScript((t) => {
    try {
      localStorage.setItem("soty.theme", t);
      document.documentElement.setAttribute("data-theme", t);
      document.documentElement.style.colorScheme = t;
    } catch {
      /* ignore */
    }
  }, theme);
}

/**
 * @returns {Promise<import('playwright').BrowserContext['storageState'] extends Function ? Awaited<ReturnType<import('playwright').BrowserContext['storageState']>> : never>}
 */
async function createAuthStorage(browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  if (existingUser && existingPass) {
    const signIn = await page.request.post(`${base}/api/auth/sign-in/username`, {
      data: { username: existingUser, password: existingPass },
      headers: { origin: base, "content-type": "application/json" },
    });
    if (!signIn.ok()) {
      throw new Error(`sign-in failed: HTTP ${signIn.status()}`);
    }
    const storage = await ctx.storageState();
    await ctx.close();
    return storage;
  }

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const user = `visaud${suffix}`.slice(0, 28);
  const pass = "AcceptTest!2026ui";

  const reg = await page.goto(`${base}/register`, {
    waitUntil: "networkidle",
    timeout: 90_000,
  });
  if (!reg || reg.status() >= 500) {
    throw new Error(
      `NETWORK_UNAVAILABLE: /register HTTP ${reg?.status() ?? "none"}`,
    );
  }

  const loginInput = page.locator("#account-login");
  await loginInput.waitFor({ state: "visible", timeout: 30_000 });
  // Wait for React hydration (controlled inputs)
  await page.waitForTimeout(1500);
  await loginInput.click();
  await loginInput.fill("");
  await loginInput.pressSequentially(user, { delay: 15 });
  await page.locator("#account-password").click();
  await page.locator("#account-password").fill(pass);
  await page.locator("#account-confirmation").click();
  await page.locator("#account-confirmation").fill(pass);
  await page.getByRole("button", { name: /создать аккаунт/i }).click();

  const checkbox = page.locator("label.recovery-confirm input[type=checkbox]");
  try {
    await checkbox.waitFor({ state: "attached", timeout: 45_000 });
  } catch {
    const msg = (
      (await page
        .locator(".account-error, [role='alert']")
        .first()
        .textContent()
        .catch(() => "")) || ""
    ).trim();
    if (/503|unavailable|недоступен|попробуйте позже/i.test(msg)) {
      throw new Error(`NETWORK_UNAVAILABLE: ${msg}`);
    }
    throw new Error(
      `PRODUCT_REGRESSION: signup did not reach recovery step${msg ? `: ${msg}` : ""}`,
    );
  }

  await page.locator("label.recovery-confirm").click();
  const continueBtn = page.getByRole("button", { name: /продолжить/i });
  await continueBtn.waitFor({ state: "visible", timeout: 10_000 });
  await continueBtn.click();

  try {
    await page.waitForFunction(
      () => !location.pathname.includes("/register"),
      null,
      { timeout: 45_000 },
    );
  } catch {
    throw new Error("PRODUCT_REGRESSION: remained on /register after recovery");
  }

  if (page.url().includes("business/new")) {
    await page.locator("#business-name").fill(`Visual Audit ${suffix}`);
    await page.getByRole("button", { name: /создать пространство/i }).click();
    await page.waitForTimeout(2500);
  }

  // Land on dashboard to confirm session
  await page.goto(`${base}/dashboard`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  if (new URL(page.url()).pathname === "/login") {
    throw new Error("PRODUCT_REGRESSION: session missing after registration");
  }

  const storage = await ctx.storageState();
  await ctx.close();
  return storage;
}

const browser = await chromium.launch({ headless: true });
const report = [];
let fatal = null;

try {
  let storage;
  try {
    storage = await createAuthStorage(browser);
  } catch (error) {
    fatal = error instanceof Error ? error.message : String(error);
    throw error;
  }

  // Public routes (no auth)
  for (const vp of VIEWPORTS) {
    for (const theme of ["light", "dark"]) {
      if (theme === "dark" && vp.name !== "390" && vp.name !== "1440") continue;
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        colorScheme: theme,
      });
      const page = await ctx.newPage();
      await applyTheme(page, theme);
      for (const route of PUBLIC_ROUTES) {
        const res = await page
          .goto(base + route, { waitUntil: "networkidle", timeout: 60_000 })
          .catch(() => null);
        await page.waitForTimeout(350);
        await page.evaluate((t) => {
          try {
            localStorage.setItem("soty.theme", t);
            document.documentElement.setAttribute("data-theme", t);
          } catch {
            /* ignore */
          }
        }, theme);
        const file = `${phase}_${routeSlug(route)}_${vp.name}_${theme}.png`;
        await page.screenshot({ path: path.join(out, file), fullPage: false });
        const overflowX = await bodyOverflowX(page);
        const entry = {
          route,
          viewport: { width: vp.width, height: vp.height },
          theme,
          status: res?.status() ?? 0,
          url: page.url(),
          pathname: new URL(page.url()).pathname,
          overflowX,
          screenshot: file,
          auth: false,
        };
        report.push(entry);
      }
      await ctx.close();
    }
  }

  // Authenticated routes
  for (const vp of VIEWPORTS) {
    for (const route of AUTH_ROUTES) {
      for (const theme of themesFor(route)) {
        const ctx = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          colorScheme: theme === "dark" ? "dark" : "light",
          storageState: storage,
        });
        const page = await ctx.newPage();
        await applyTheme(page, theme);
        const res = await page
          .goto(base + route, { waitUntil: "networkidle", timeout: 60_000 })
          .catch(() => null);
        await page.waitForTimeout(400);
        await page.evaluate((t) => {
          try {
            localStorage.setItem("soty.theme", t);
            document.documentElement.setAttribute("data-theme", t);
          } catch {
            /* ignore */
          }
        }, theme);
        await page.waitForTimeout(150);

        const pathname = new URL(page.url()).pathname;
        const file = `${phase}_${routeSlug(route)}_${vp.name}_${theme}.png`;
        await page.screenshot({ path: path.join(out, file), fullPage: false });
        const overflowX = await bodyOverflowX(page);
        const loginRedirect = pathname === "/login";
        report.push({
          route,
          viewport: { width: vp.width, height: vp.height },
          theme,
          status: res?.status() ?? 0,
          url: page.url(),
          pathname,
          overflowX,
          loginRedirect,
          screenshot: file,
          auth: true,
        });
        await ctx.close();
      }
    }
  }
} catch (error) {
  if (!fatal) fatal = error instanceof Error ? error.message : String(error);
} finally {
  await browser.close();
}

await writeFile(path.join(out, "report.json"), JSON.stringify(report, null, 2));

const pngs = (await readdir(out)).filter((f) => f.endsWith(".png"));
const issues = report.filter(
  (r) =>
    r.status >= 400 ||
    r.overflowX ||
    r.loginRedirect ||
    (r.auth && /\/login/.test(r.pathname || "")),
);

const summary = {
  ok: !fatal && pngs.length > 0 && issues.length === 0,
  count: pngs.length,
  reportEntries: report.length,
  out,
  fatal,
  issues: issues.slice(0, 40),
};

console.log(JSON.stringify(summary, null, 2));

if (fatal || pngs.length === 0 || issues.length > 0) {
  process.exitCode = 1;
}
