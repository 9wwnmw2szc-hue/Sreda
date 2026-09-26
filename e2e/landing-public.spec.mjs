import { test, expect } from "playwright/test";

const baseURL =
  process.env.E2E_BASE_URL || process.env.AUDIT_BASE_URL || "http://127.0.0.1:3000";

test.describe("public landing before auth", () => {
  test("GET / shows landing and CTAs reach existing auth pages", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1122, height: 900 });
    await page.goto(baseURL + "/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Все инструменты",
    );
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "бизнеса",
    );
    await expect(page.locator(".landing")).toBeVisible();

    await page.getByRole("link", { name: "Войти" }).first().click();
    await expect(page).toHaveURL(/\/login/);

    await page.goto(baseURL + "/");
    await page.getByRole("link", { name: /Попробовать/ }).first().click();
    await expect(page).toHaveURL(/\/register/);
  });
});
