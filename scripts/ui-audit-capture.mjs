/**
 * Canonical screenshot / visual audit pipeline for «Соты».
 *
 * Creates a throwaway account via /register (no AUDIT_USER/AUDIT_PASS required),
 * then captures authenticated + public routes across viewports and themes.
 *
 * Env:
 *   AUDIT_BASE_URL   default http://127.0.0.1:3000 (PR local) or staging URL
 *   AUDIT_OUTPUT     default artifacts/visual-audit
 *   AUDIT_PHASE      filename prefix (default "shot"; use "pr" / "staging")
 *   AUDIT_USER / AUDIT_PASS  optional existing account (never deleted)
 *   AUDIT_IGNORE_HTTPS_ERRORS=1 for self-signed CI HTTPS
 *   AUDIT_REQUIRE_READY=1 fail on app errors / business-select / stale loading
 *   AUDIT_CLEANUP_THROWAWAY=1 attempt account deletion for audit-created users
 *
 * Exit 1 if registration fails, login redirect, overflow, not-ready auth page, or zero PNGs.
 */
import { mkdir, writeFile, readdir } from "node:fs/promises";
import { chromium } from "playwright";
import path from "node:path";

const base =
  process.env.AUDIT_BASE_URL || "http://127.0.0.1:3000";
const out = process.env.AUDIT_OUTPUT || "artifacts/visual-audit";
const phase = process.env.AUDIT_PHASE || "shot";
const existingUser = process.env.AUDIT_USER || "";
const existingPass = process.env.AUDIT_PASS || "";
const ignoreHttps =
  process.env.AUDIT_IGNORE_HTTPS_ERRORS === "1" ||
  /^https:\/\/127\.0\.0\.1(?::\d+)?/i.test(base);
const requireReady = process.env.AUDIT_REQUIRE_READY === "1";
const cleanupThrowaway = process.env.AUDIT_CLEANUP_THROWAWAY === "1";

await mkdir(out, { recursive: true });

const VIEWPORTS = [
  { name: "320", width: 320, height: 568 },
  { name: "390", width: 390, height: 844 },
  { name: "430", width: 430, height: 932 },
  { name: "820", width: 820, height: 1180 },
  { name: "1440", width: 1440, height: 900 },
];

const PUBLIC_ROUTES = ["/login", "/register", "/recover"];

const AUTH_ROUTES_PR = [
  "/dashboard",
  "/solutions",
  "/orders",
  "/leads",
  "/leads/concept",
  "/bookings",
  "/messages",
  "/clients",
  "/posts",
  "/settings?section=connections",
  "/analytics",
  "/notifications",
  "/settings?section=business",
  "/settings?section=account",
  "/settings?section=ai",
  "/settings?section=danger",
];

/** Reduced set for post-merge staging (avoid self-induced 429). */
const AUTH_ROUTES_STAGING = [
  "/dashboard",
  "/solutions",
  "/orders",
  "/bookings",
  "/settings?section=connections",
  "/settings?section=business",
  "/settings?section=account",
];

const AUTH_ROUTES =
  phase === "staging" ? AUTH_ROUTES_STAGING : AUTH_ROUTES_PR;

const DARK_ROUTES = new Set([
  "/dashboard",
  "/solutions",
  "/orders",
  "/leads",
  "/leads/concept",
  "/bookings",
  "/messages",
  "/settings?section=connections",
  "/analytics",
  "/settings?section=business",
  "/settings?section=account",
  "/login",
  "/register",
]);

function routeSlug(route) {
  return (
    route
      .replace(/^\//, "")
      .replace(/\?/g, "_")
      .replace(/=/g, "-")
      .replace(/\//g, "_") || "home"
  );
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
      (body != null && body.scrollWidth > body.clientWidth + 1)
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
 * Fail if authenticated page is stuck in loading / business-select / app error.
 * Empty data states ("Заказов пока нет") are allowed.
 */
async function assertRouteReady(page, route) {
  if (!requireReady) return { ready: true, reason: null };

  const deadline = Date.now() + 25_000;
  let lastReason = "route not ready";

  while (Date.now() < deadline) {
    const probe = await page.evaluate(() => {
      const text = (document.body?.innerText || "").replace(/\s+/g, " ");
      const alert =
        document
          .querySelector(".account-error, [role='alert']")
          ?.textContent?.trim() || "";
      const switcher = document.querySelector(".business-switcher");
      const switcherText = (switcher?.textContent || "").replace(/\s+/g, " ").trim();
      const nameEl = switcher?.querySelector(".business-switcher__name");
      const nameText = (nameEl?.textContent || "").replace(/\s+/g, " ").trim();
      const loading =
        /Загрузка бизнеса…/i.test(switcherText) ||
        /Загрузка бизнеса…/i.test(nameText) ||
        (!nameText && /Загрузка бизнеса…/i.test(text));
      const accessError =
        /Не удалось проверить доступ к вашим? бизнесам?/i.test(text) ||
        /Не удалось проверить доступ к вашим? бизнесам?/i.test(alert);
      const selectBusiness =
        /^Выберите бизнес\.?$/m.test(
          document.querySelector("main p, .app-main p, main .panel p")
            ?.textContent?.trim() || "",
        ) ||
        (document.querySelectorAll("main p, .app-main p").length > 0 &&
          [...document.querySelectorAll("main p, .app-main p")].some(
            (p) => /^Выберите бизнес\.?$/i.test((p.textContent || "").trim()),
          ));
      const hasBusinessName =
        Boolean(nameText) &&
        !/Загрузка бизнеса…/i.test(nameText) &&
        !/^Выберите бизнес/i.test(nameText);
      return {
        loading,
        accessError,
        selectBusiness,
        hasBusinessName,
        alert: alert.slice(0, 160),
        snippet: text.slice(0, 200),
        switcherText: switcherText.slice(0, 80),
      };
    });

    if (probe.accessError) {
      return {
        ready: false,
        reason: probe.alert || probe.snippet || "business access error",
      };
    }

    if (probe.hasBusinessName && !probe.loading) {
      // Business context ready — allow intentional empty-data copy
      break;
    }

    if (!probe.loading && probe.selectBusiness) {
      lastReason = "Выберите бизнес. (no current business after load)";
      // Keep waiting briefly — context may still hydrate
    } else if (probe.loading) {
      lastReason = probe.switcherText || "Загрузка бизнеса…";
    } else {
      lastReason = probe.alert || probe.snippet || lastReason;
    }
    await page.waitForTimeout(400);
  }

  const finalProbe = await page.evaluate(() => {
    const text = (document.body?.innerText || "").replace(/\s+/g, " ");
    const alert =
      document
        .querySelector(".account-error, [role='alert']")
        ?.textContent?.trim() || "";
    const nameEl = document.querySelector(".business-switcher__name");
    const nameText = (nameEl?.textContent || "").replace(/\s+/g, " ").trim();
    const hasBusinessName =
      Boolean(nameText) &&
      !/Загрузка бизнеса…/i.test(nameText) &&
      !/^Выберите бизнес/i.test(nameText);
    const accessError =
      /Не удалось проверить доступ к вашим? бизнесам?/i.test(text) ||
      /Не удалось проверить доступ к вашим? бизнесам?/i.test(alert);
    const selectBusiness = [...document.querySelectorAll("main p, .app-main p")].some(
      (p) => /^Выберите бизнес\.?$/i.test((p.textContent || "").trim()),
    );
    return {
      hasBusinessName,
      accessError,
      selectBusiness,
      alert: alert.slice(0, 160),
      snippet: text.slice(0, 200),
    };
  });

  if (finalProbe.accessError || !finalProbe.hasBusinessName || finalProbe.selectBusiness) {
    return {
      ready: false,
      reason:
        finalProbe.alert ||
        (finalProbe.selectBusiness ? "Выберите бизнес." : null) ||
        finalProbe.snippet ||
        lastReason,
    };
  }

  const shell = page.locator("main, .app-main, .page-header, .account-card").first();
  try {
    await shell.waitFor({ state: "visible", timeout: 10_000 });
  } catch {
    return { ready: false, reason: "no main shell" };
  }
  return { ready: true, reason: null };
}

async function createAuthStorage(browser) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: ignoreHttps });
  const page = await ctx.newPage();
  let created = null;

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
    return { storage, created: null };
  }

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const user = `visaud${suffix}`.slice(0, 28);
  const pass = "AcceptTest!2026ui";
  created = { user, pass };

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
    const name = page.locator("#business-name");
    await name.waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForTimeout(800);
    await name.click();
    await name.fill("");
    await name.pressSequentially(`Visual Audit ${suffix}`, { delay: 15 });
    const createPromise = page.waitForResponse(
      (r) =>
        r.url().includes("/api/v1/businesses") &&
        r.request().method() === "POST",
      { timeout: 60_000 },
    );
    await page.getByRole("button", { name: /создать пространство/i }).click();
    const createRes = await createPromise.catch(() => null);
    if (createRes && !createRes.ok()) {
      const body = (await createRes.text().catch(() => "")).slice(0, 200);
      throw new Error(
        `PRODUCT_REGRESSION: create business HTTP ${createRes.status()} ${body}`,
      );
    }
    try {
      await page.waitForFunction(
        () => !location.pathname.includes("/business/new"),
        null,
        { timeout: 60_000 },
      );
    } catch {
      const errText = (
        (await page
          .locator(".account-error, [role='alert']")
          .first()
          .textContent()
          .catch(() => "")) || ""
      ).trim();
      throw new Error(
        `PRODUCT_REGRESSION: remained on /business/new after create${errText ? `: ${errText}` : ""}`,
      );
    }
  }

  await page.goto(`${base}/dashboard`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForTimeout(1000);
  const dashPath = new URL(page.url()).pathname;
  if (dashPath === "/login") {
    throw new Error("PRODUCT_REGRESSION: session missing after registration");
  }
  if (dashPath.includes("/business/new")) {
    throw new Error(
      "PRODUCT_REGRESSION: still redirected to /business/new after create",
    );
  }

  const storage = await ctx.storageState();
  await ctx.close();
  return { storage, created };
}

async function cleanupCreated(browser, created) {
  // Never delete externally supplied AUDIT_USER.
  if (!cleanupThrowaway || !created || existingUser) {
    return { cleaned: false, reason: "skipped" };
  }
  const ctx = await browser.newContext({ ignoreHTTPSErrors: ignoreHttps });
  try {
    const signIn = await ctx.request.post(`${base}/api/auth/sign-in/username`, {
      data: { username: created.user, password: created.pass },
      headers: { origin: base, "content-type": "application/json" },
    });
    if (!signIn.ok()) {
      return { cleaned: false, reason: `sign-in ${signIn.status()}` };
    }
    const req = await ctx.request.post(`${base}/api/v1/account/deletion`, {
      data: { action: "request" },
      headers: { origin: base, "content-type": "application/json" },
    });
    if (!req.ok()) {
      return { cleaned: false, reason: `deletion request ${req.status()}` };
    }
    const payload = await req.json();
    const token = payload?.token;
    const impact = payload?.impact;
    if (!token) {
      return { cleaned: false, reason: "no deletion token" };
    }
    const decisions = (impact?.ownedBusinesses || []).map((b) => ({
      businessId: b.id,
      action: "archive",
    }));
    const del = await ctx.request.post(`${base}/api/v1/account/deletion`, {
      data: {
        action: "confirm",
        token,
        password: created.pass,
        confirmation: "УДАЛИТЬ",
        decisions,
      },
      headers: { origin: base, "content-type": "application/json" },
    });
    return {
      cleaned: del.ok(),
      reason: del.ok() ? "deleted" : `deletion confirm ${del.status()}`,
    };
  } catch (error) {
    return {
      cleaned: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await ctx.close();
  }
}

const browser = await chromium.launch({ headless: true });
const report = [];
let fatal = null;
let createdAccount = null;
let cleanupResult = null;

try {
  let storage;
  try {
    const auth = await createAuthStorage(browser);
    storage = auth.storage;
    createdAccount = auth.created;
  } catch (error) {
    fatal = error instanceof Error ? error.message : String(error);
    throw error;
  }

  for (const vp of VIEWPORTS) {
    for (const theme of ["light", "dark"]) {
      if (theme === "dark" && vp.name !== "390" && vp.name !== "1440") continue;
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        colorScheme: theme,
        ignoreHTTPSErrors: ignoreHttps,
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
        report.push({
          route,
          viewport: { width: vp.width, height: vp.height },
          theme,
          status: res?.status() ?? 0,
          url: page.url(),
          pathname: new URL(page.url()).pathname,
          overflowX: await bodyOverflowX(page),
          screenshot: file,
          auth: false,
        });
      }
      await ctx.close();
    }
  }

  for (const vp of VIEWPORTS) {
    // One authenticated context per viewport — reuse across routes/themes to
    // avoid re-hydrating BusinessProvider (and API storms) on every shot.
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      colorScheme: "light",
      storageState: storage,
      ignoreHTTPSErrors: ignoreHttps,
    });
    const page = await ctx.newPage();
    await applyTheme(page, "light");
    // Warm business context once
    await page
      .goto(base + "/dashboard", { waitUntil: "domcontentloaded", timeout: 60_000 })
      .catch(() => null);
    const warm = await assertRouteReady(page, "/dashboard");
    if (!warm.ready) {
      report.push({
        route: "/dashboard",
        viewport: { width: vp.width, height: vp.height },
        theme: "light",
        status: 0,
        url: page.url(),
        pathname: new URL(page.url()).pathname,
        overflowX: false,
        loginRedirect: false,
        stuckOnboarding: false,
        notReady: true,
        notReadyReason: warm.reason,
        screenshot: null,
        auth: true,
      });
      await ctx.close();
      continue;
    }

    for (const route of AUTH_ROUTES) {
      for (const theme of themesFor(route)) {
        await applyTheme(page, theme);
        await page.emulateMedia({ colorScheme: theme === "dark" ? "dark" : "light" });
        const res = await page
          .goto(base + route, { waitUntil: "domcontentloaded", timeout: 60_000 })
          .catch(() => null);
        await page.evaluate((t) => {
          try {
            localStorage.setItem("soty.theme", t);
            document.documentElement.setAttribute("data-theme", t);
            document.documentElement.style.colorScheme = t;
          } catch {
            /* ignore */
          }
        }, theme);
        await page.waitForTimeout(250);

        const ready = await assertRouteReady(page, route);
        const pathname = new URL(page.url()).pathname;
        const file = `${phase}_${routeSlug(route)}_${vp.name}_${theme}.png`;
        if (ready.ready || !requireReady) {
          await page.screenshot({ path: path.join(out, file), fullPage: false });
        }
        const overflowX = await bodyOverflowX(page);
        const loginRedirect = pathname === "/login";
        const stuckOnboarding =
          pathname.includes("/business/new") || pathname.includes("/register");
        report.push({
          route,
          viewport: { width: vp.width, height: vp.height },
          theme,
          status: res?.status() ?? 0,
          url: page.url(),
          pathname,
          overflowX,
          loginRedirect,
          stuckOnboarding,
          notReady: !ready.ready,
          notReadyReason: ready.reason,
          screenshot: ready.ready || !requireReady ? file : null,
          auth: true,
        });

        // The leads redesign is a multi-tab product surface. Capture every tab
        // on the two review viewports so visual QA covers more than the default list.
        if (
          route === "/leads/concept" &&
          ready.ready &&
          (vp.name === "390" || vp.name === "1440")
        ) {
          const conceptTabs = [
            { name: "Заявки", slug: "work" },
            { name: "Форма", slug: "form" },
            { name: "Автоматизация", slug: "automation" },
            { name: "Настройки", slug: "settings" },
            { name: "Статистика", slug: "stats" },
          ];
          for (const tab of conceptTabs) {
            await page.getByRole("button", { name: tab.name, exact: true }).click();
            await page.waitForTimeout(100);
            const tabFile =
              `${phase}_leads_concept_${tab.slug}_${vp.name}_${theme}.png`;
            await page.screenshot({
              path: path.join(out, tabFile),
              fullPage: true,
            });
            report.push({
              route: `${route}#${tab.slug}`,
              viewport: { width: vp.width, height: vp.height },
              theme,
              status: res?.status() ?? 0,
              url: page.url(),
              pathname,
              overflowX: await bodyOverflowX(page),
              loginRedirect: false,
              stuckOnboarding: false,
              notReady: false,
              notReadyReason: null,
              screenshot: tabFile,
              auth: true,
            });
          }
        }
      }
    }
    await ctx.close();
  }

  cleanupResult = await cleanupCreated(browser, createdAccount);
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
    r.stuckOnboarding ||
    r.notReady ||
    (r.auth && /\/login/.test(r.pathname || "")),
);

const summary = {
  ok: !fatal && pngs.length > 0 && issues.length === 0,
  count: pngs.length,
  reportEntries: report.length,
  out,
  phase,
  base,
  checkedSha: process.env.GITHUB_SHA || null,
  fatal,
  cleanupResult,
  createdThrowaway: Boolean(createdAccount),
  issues: issues.slice(0, 40),
};

console.log(JSON.stringify(summary, null, 2));

if (fatal || pngs.length === 0 || issues.length > 0) {
  process.exitCode = 1;
}
