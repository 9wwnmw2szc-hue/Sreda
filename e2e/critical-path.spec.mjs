/**
 * Closed Beta critical-path Playwright smoke.
 * Requires a reachable app (local or staging) via E2E_BASE_URL.
 * Does not use production credentials.
 */
import { test, expect } from "playwright/test";

const baseURL = process.env.E2E_BASE_URL || process.env.AUDIT_BASE_URL || "http://127.0.0.1:3000";

test.describe("Closed Beta smoke", () => {
  test("login and register pages render without horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const route of ["/login", "/register", "/recover"]) {
      const response = await page.goto(baseURL + route, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      expect(response?.ok() || response?.status() === 200).toBeTruthy();
      const overflow = await page.evaluate(() => {
        return (
          document.documentElement.scrollWidth >
            document.documentElement.clientWidth + 1 ||
          document.body.scrollWidth > document.documentElement.clientWidth + 1
        );
      });
      expect(overflow, `${route} overflows`).toBeFalsy();
    }
  });

  test("health live probe responds", async ({ request }) => {
    const res = await request.get(baseURL + "/api/health");
    expect(res.status()).toBeLessThan(500);
  });
});
