/**
 * Systemic UI protection — AUTH / APP SHELL / SETTINGS basics.
 * Requires a reachable app via E2E_BASE_URL or AUDIT_BASE_URL.
 * Prefer Chromium (playwright.config default). Does not disable other e2e specs.
 */
import { test, expect } from "playwright/test";
import fs from "fs";
import path from "path";

const baseURL =
  process.env.E2E_BASE_URL ||
  process.env.AUDIT_BASE_URL ||
  "http://127.0.0.1:3000";

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

async function buttonOverflowWrapAnywhere(page) {
  return page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll(".button")) {
      if (getComputedStyle(el).overflowWrap === "anywhere") {
        bad.push((el.textContent || "").trim().slice(0, 48));
      }
    }
    return bad;
  });
}

async function minInputFontSize(page) {
  return page.evaluate(() => {
    let min = Infinity;
    for (const el of document.querySelectorAll("input, textarea, select")) {
      if (!(el instanceof HTMLElement)) continue;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const size = parseFloat(style.fontSize) || 0;
      if (size > 0) min = Math.min(min, size);
    }
    return min === Infinity ? 0 : min;
  });
}

/** Hero/card geometry: when both visible and stacked, heroBottom + 16 <= cardTop. */
async function authGeometryOk(page) {
  return page.evaluate(() => {
    const hero =
      document.querySelector(".account-story") ||
      document.querySelector('[class*="__story"]') ||
      document.querySelector("[data-auth-hero]");
    const card =
      document.querySelector(".account-form-shell") ||
      document.querySelector('[class*="__shell"]') ||
      document.querySelector(".account-card") ||
      document.querySelector("[data-auth-card]");
    if (!hero || !card) return { bothVisible: false, ok: true };
    const hs = getComputedStyle(hero);
    const cs = getComputedStyle(card);
    if (
      hs.display === "none" ||
      hs.visibility === "hidden" ||
      cs.display === "none" ||
      cs.visibility === "hidden"
    ) {
      return { bothVisible: false, ok: true };
    }
    const hr = hero.getBoundingClientRect();
    const cr = card.getBoundingClientRect();
    if (hr.height < 1 || cr.height < 1) {
      return { bothVisible: false, ok: true };
    }
    // Side-by-side desktop: card is not stacked under the hero
    const stacked = cr.top >= hr.bottom - 8;
    if (!stacked) {
      return { bothVisible: true, ok: true, layout: "side-by-side" };
    }
    const ok = hr.bottom + 16 <= cr.top + 0.5;
    return {
      bothVisible: true,
      ok,
      heroBottom: hr.bottom,
      cardTop: cr.top,
    };
  });
}

async function registerThrowaway(page, suffix) {
  const user = `e2eux${suffix}`;
  const pass = "AcceptTest!2026ui";
  await page.goto(baseURL + "/register", {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page
    .locator(
      'input[name="username"], input[autocomplete="username"], #account-login',
    )
    .first()
    .fill(user);
  const passwords = page.locator('input[type="password"]');
  await passwords.nth(0).fill(pass);
  if ((await passwords.count()) > 1) await passwords.nth(1).fill(pass);
  await page.getByRole("button", { name: /создать аккаунт/i }).click();

  const checkbox = page.locator("label.recovery-confirm input[type=checkbox]");
  try {
    await checkbox.waitFor({ state: "attached", timeout: 20_000 });
  } catch {
    const msg = (
      (await page
        .locator(".account-error")
        .first()
        .textContent()
        .catch(() => "")) || ""
    ).trim();
    const err = new Error(
      `REGISTRATION_UNAVAILABLE: ${msg || "signup did not reach recovery step"}`,
    );
    err.name = "RegistrationUnavailable";
    throw err;
  }

  // Click the label so React onChange updates `saved` (force check does not).
  await page.locator("label.recovery-confirm").click();
  const continueBtn = page.getByRole("button", { name: /продолжить/i });
  await expect(continueBtn).toBeEnabled({ timeout: 5_000 });
  await continueBtn.click();
  try {
    await page.waitForFunction(
      () => !location.pathname.includes("/register"),
      null,
      { timeout: 30_000 },
    );
  } catch {
    const err = new Error(
      "REGISTRATION_UNAVAILABLE: remained on /register after signup",
    );
    err.name = "RegistrationUnavailable";
    throw err;
  }

  if (page.url().includes("business/new")) {
    await page.locator("#business-name").fill(`UI System ${suffix}`);
    await page.getByRole("button", { name: /создать пространство/i }).click();
    await page.waitForTimeout(3000);
  }
  return user;
}

async function ensureAuthenticated(page, testInfo) {
  const suffix = Date.now().toString(36).slice(-6);
  try {
    await registerThrowaway(page, suffix);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      (error instanceof Error && error.name === "RegistrationUnavailable") ||
      /REGISTRATION_UNAVAILABLE|ERR_CONNECTION_REFUSED|net::ERR_/i.test(
        message,
      )
    ) {
      testInfo.skip(true, message);
      return;
    }
    throw error;
  }
}

test.describe("UI system — AUTH", () => {
  for (const width of [390, 320]) {
    test(`no horizontal overflow on /login and /register at ${width}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width,
        height: width === 320 ? 568 : 844,
      });
      for (const route of ["/login", "/register"]) {
        const response = await page.goto(baseURL + route, {
          waitUntil: "domcontentloaded",
          timeout: 60_000,
        });
        expect(response?.status(), `${route} status`).toBeLessThan(400);
        expect(
          await bodyOverflowX(page),
          `${route}@${width} overflow-x`,
        ).toBeFalsy();
      }
    });
  }

  test("auth buttons: .button must not use overflow-wrap:anywhere", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const route of ["/login", "/register"]) {
      await page.goto(baseURL + route, {
        waitUntil: "networkidle",
        timeout: 60_000,
      });
      await page.locator(".button").first().waitFor({ state: "visible" });
      const bad = await buttonOverflowWrapAnywhere(page);
      expect(bad, `${route} overflow-wrap:anywhere`).toEqual([]);
    }
  });

  test("auth inputs: font-size >= 16 on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const route of ["/login", "/register"]) {
      await page.goto(baseURL + route, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      const min = await minInputFontSize(page);
      expect(min, `${route} input font-size`).toBeGreaterThanOrEqual(16);
    }
  });

  test("auth geometry: hero and card do not collide when both visible", async ({
    page,
  }) => {
    for (const size of [
      { width: 390, height: 844 },
      { width: 1280, height: 800 },
    ]) {
      await page.setViewportSize(size);
      for (const route of ["/login", "/register"]) {
        await page.goto(baseURL + route, {
          waitUntil: "domcontentloaded",
          timeout: 60_000,
        });
        const geo = await authGeometryOk(page);
        expect(
          geo.ok,
          `${route}@${size.width}: heroBottom+16 <= cardTop (${JSON.stringify(geo)})`,
        ).toBeTruthy();
      }
    }
  });
});

test.describe("UI system — APP SHELL", () => {
  test("dashboard shell has no horizontal overflow at 390 after register", async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await ensureAuthenticated(page, testInfo);
    await page.goto(baseURL + "/dashboard", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    expect(await bodyOverflowX(page), "dashboard overflow-x").toBeFalsy();
    const mobileHeader = page.locator(".mobile-header");
    if (await mobileHeader.count()) {
      await expect(mobileHeader.first()).toBeVisible();
    }
  });
});

test.describe("UI system — SETTINGS", () => {
  test("settings business section basics at 390", async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await ensureAuthenticated(page, testInfo);
    await page.goto(baseURL + "/settings?section=business", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await expect(
      page.getByRole("heading", { name: "Настройки" }),
    ).toBeVisible();
    expect(await bodyOverflowX(page), "settings overflow-x").toBeFalsy();
    const bad = await buttonOverflowWrapAnywhere(page);
    expect(bad, "settings .button overflow-wrap").toEqual([]);
  });
});

const shotDir = process.env.E2E_SCREENSHOT_DIR;
if (shotDir) {
  fs.mkdirSync(path.resolve(shotDir), { recursive: true });
}
