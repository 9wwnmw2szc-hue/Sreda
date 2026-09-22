/**
 * Authenticated settings / account visual coverage for Closed Beta mobile UX.
 * Uses throwaway registration against E2E_BASE_URL (local or staging).
 */
import { test, expect } from "playwright/test";
import fs from "fs";
import path from "path";

const baseURL =
  process.env.E2E_BASE_URL ||
  process.env.AUDIT_BASE_URL ||
  "http://127.0.0.1:3000";

const outDir =
  process.env.E2E_SCREENSHOT_DIR ||
  "/opt/cursor/artifacts/screenshots/mobile-settings-account";

const viewports = [
  { name: "390", width: 390, height: 844 },
  { name: "430", width: 430, height: 932 },
  { name: "820", width: 820, height: 1180 },
  { name: "1440", width: 1440, height: 900 },
];

async function registerAndCreateBusiness(page, suffix) {
  const user = `e2eux${suffix}`;
  const pass = "AcceptTest!2026ux";
  await page.goto(baseURL + "/register", {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page
    .locator('input[name="username"], input[autocomplete="username"]')
    .first()
    .fill(user);
  const passwords = page.locator('input[type="password"]');
  await passwords.nth(0).fill(pass);
  if ((await passwords.count()) > 1) await passwords.nth(1).fill(pass);
  await page.getByRole("button", { name: /создать аккаунт/i }).click();
  await page.waitForTimeout(2500);
  const checkbox = page.locator("label.recovery-confirm input[type=checkbox]");
  if (await checkbox.count()) {
    await checkbox.check({ force: true });
    await page.getByRole("button", { name: /продолжить/i }).click();
  }
  await page.waitForURL(/business\/new|dashboard|onboarding/, { timeout: 45_000 });
  if (page.url().includes("business/new")) {
    await page.locator("#business-name").fill(`UX Приёмка ${suffix}`);
    await page.getByRole("button", { name: /создать пространство/i }).click();
    await page.waitForTimeout(2500);
  }
  return user;
}

test.describe("Settings / Account mobile UX", () => {
  test("authenticated settings screenshots across viewports", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    fs.mkdirSync(outDir, { recursive: true });
    const suffix = Date.now().toString(36).slice(-6);
    await page.setViewportSize({ width: 390, height: 844 });
    await registerAndCreateBusiness(page, suffix);

    // Dashboard header at 390
    await page.goto(baseURL + "/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".mobile-header")).toBeVisible();
    await expect(page.locator(".soty-command--mobile")).toBeVisible();
    await page.screenshot({
      path: path.join(outDir, `dashboard-header-390.png`),
      fullPage: false,
    });

    // Open mobile search sheet
    await page.locator(".soty-command__trigger").click();
    await expect(page.locator(".soty-command__sheet")).toBeVisible();
    await page.screenshot({
      path: path.join(outDir, `search-sheet-390.png`),
      fullPage: false,
    });
    await page.locator(".soty-command__close").click();

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (const [section, label] of [
        ["business", "business"],
        ["account", "account"],
      ]) {
        await page.goto(baseURL + `/settings?section=${section}`, {
          waitUntil: "domcontentloaded",
          timeout: 60_000,
        });
        await expect(page.getByRole("heading", { name: "Настройки" })).toBeVisible();
        const overflow = await page.evaluate(() => {
          return (
            document.documentElement.scrollWidth >
              document.documentElement.clientWidth + 1 ||
            document.body.scrollWidth > document.documentElement.clientWidth + 1
          );
        });
        expect(overflow, `${section}@${vp.name} overflow`).toBeFalsy();
        await page.screenshot({
          path: path.join(outDir, `settings-${label}-${vp.name}.png`),
          fullPage: true,
        });
      }
    }

    // Account security subsections — scroll into view
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(baseURL + "/settings?section=account", {
      waitUntil: "domcontentloaded",
    });
    for (const heading of ["Сессии", "PIN для входа", "Резервные коды", "Удаление аккаунта"]) {
      const h = page.getByRole("heading", { name: heading });
      await expect(h).toBeVisible();
      await h.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: path.join(
          outDir,
          `account-${heading.replace(/\s+/g, "-").toLowerCase()}-390.png`,
        ),
        fullPage: false,
      });
    }

    // Session revoke button must not wrap mid-word
    const revoke = page.getByRole("button", { name: /Завершить сессию|Выйти на всех/i }).first();
    if (await revoke.count()) {
      const box = await revoke.boundingBox();
      expect(box?.width ?? 0).toBeGreaterThan(80);
    }
  });
});
