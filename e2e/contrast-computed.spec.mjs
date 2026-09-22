/**
 * Browser contrast checks for critical UI elements (light + dark).
 * Uses relativeLuminance / contrastRatio from src/lib/contrast.ts.
 */
import { test, expect } from "playwright/test";
import { contrastRatio, AA_NORMAL, UI_CHROME_MIN } from "../src/lib/contrast.ts";

const baseURL =
  process.env.E2E_BASE_URL ||
  process.env.AUDIT_BASE_URL ||
  "http://127.0.0.1:3000";

function parseCssColor(input) {
  const s = String(input || "").trim();
  const rgba = s.match(
    /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i,
  );
  if (rgba) {
    return {
      r: Number(rgba[1]),
      g: Number(rgba[2]),
      b: Number(rgba[3]),
      a: rgba[4] == null ? 1 : Number(rgba[4]),
    };
  }
  if (s.startsWith("#")) {
    const hex = s.slice(1);
    const full =
      hex.length === 3
        ? hex
            .split("")
            .map((c) => c + c)
            .join("")
        : hex.slice(0, 6);
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
      a: 1,
    };
  }
  return null;
}

function compositeOver(fg, bg) {
  const a = Math.max(0, Math.min(1, fg.a ?? 1));
  if (a >= 0.999) return { r: fg.r, g: fg.g, b: fg.b };
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
  };
}

async function sample(page, selector, { fill, placeholder } = {}) {
  return page.evaluate(
    ({ selector, fill, placeholder }) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      if (fill != null && "value" in el) {
        el.value = fill;
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
      const style = getComputedStyle(el);
      let color = style.color;
      let background = style.backgroundColor;
      if (placeholder) {
        // Approximate placeholder via ::placeholder when supported
        try {
          const ph = getComputedStyle(el, "::placeholder");
          if (ph && ph.color) color = ph.color;
        } catch {
          /* ignore */
        }
      }
      // Walk ancestors for opaque background
      let node = el;
      while (node && node !== document.documentElement) {
        const bg = getComputedStyle(node).backgroundColor;
        const parsed = bg.match(
          /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i,
        );
        if (parsed) {
          const a = parsed[4] == null ? 1 : Number(parsed[4]);
          if (a >= 0.95) {
            background = bg;
            break;
          }
        }
        node = node.parentElement;
      }
      return {
        color,
        background,
        fontSize: style.fontSize,
        text: (el.textContent || el.value || "").slice(0, 40),
      };
    },
    { selector, fill, placeholder: Boolean(placeholder) },
  );
}

function ratioFromSample(sampleResult) {
  if (!sampleResult) return null;
  const fg = parseCssColor(sampleResult.color);
  const bg = parseCssColor(sampleResult.background);
  if (!fg || !bg) return null;
  const composed = compositeOver(fg, bg);
  return contrastRatio(composed, { r: bg.r, g: bg.g, b: bg.b });
}

async function setTheme(page, theme) {
  await page.addInitScript((t) => {
    try {
      localStorage.setItem("soty.theme", t);
      document.documentElement.setAttribute("data-theme", t);
      document.documentElement.style.colorScheme = t;
    } catch {
      /* ignore */
    }
  }, theme);
  await page.evaluate((t) => {
    try {
      localStorage.setItem("soty.theme", t);
      document.documentElement.setAttribute("data-theme", t);
      document.documentElement.style.colorScheme = t;
    } catch {
      /* ignore */
    }
  }, theme);
}

for (const theme of ["light", "dark"]) {
  test.describe(`computed contrast — ${theme}`, () => {
    test.use({ colorScheme: theme === "dark" ? "dark" : "light" });

    test(`register/login critical text (${theme})`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(baseURL + "/register", {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await setTheme(page, theme);
      await page.waitForTimeout(200);

      const checks = [];

      const label = await sample(page, 'label[for="account-login"], .field__label, .account-card label');
      const labelRatio = ratioFromSample(label);
      if (labelRatio != null) {
        checks.push({ name: "label", ratio: labelRatio, min: AA_NORMAL });
      }

      await page.locator("#account-login").fill("contrastuser");
      const value = await sample(page, "#account-login", { fill: "contrastuser" });
      const valueRatio = ratioFromSample(value);
      if (valueRatio != null) {
        checks.push({ name: "input-value", ratio: valueRatio, min: AA_NORMAL });
      }

      // Clear and check placeholder approximation via empty field color
      await page.locator("#account-login").fill("");
      const ph = await sample(page, "#account-login", { placeholder: true });
      const phRatio = ratioFromSample(ph);
      if (phRatio != null) {
        // placeholders may be softer; still require UI chrome minimum
        checks.push({ name: "placeholder", ratio: phRatio, min: UI_CHROME_MIN });
      }

      const helper = await sample(page, "#login-hint, .field-hint");
      const helperRatio = ratioFromSample(helper);
      if (helperRatio != null) {
        checks.push({ name: "helper", ratio: helperRatio, min: UI_CHROME_MIN });
      }

      const primary = await sample(page, "button.button--primary, .button.button--primary");
      const primaryRatio = ratioFromSample(primary);
      if (primaryRatio != null) {
        checks.push({ name: "primary-button", ratio: primaryRatio, min: AA_NORMAL });
      }

      expect(checks.length, "expected at least some contrast samples").toBeGreaterThan(0);
      for (const c of checks) {
        expect(
          c.ratio,
          `${theme} ${c.name} contrast ${c.ratio?.toFixed?.(2)} < ${c.min}`,
        ).toBeGreaterThanOrEqual(c.min);
      }
    });

    test(`login secondary / button (${theme})`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(baseURL + "/login", {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await setTheme(page, theme);
      await page.waitForTimeout(200);

      const primary = await sample(page, "button.button--primary, .card .submit, .button");
      const ratio = ratioFromSample(primary);
      if (ratio != null) {
        expect(ratio, `${theme} login CTA`).toBeGreaterThanOrEqual(AA_NORMAL);
      }

      // status chips if present on page (may be absent on login)
      const chip = await sample(page, ".status-chip--new, .status-chip");
      const chipRatio = ratioFromSample(chip);
      if (chipRatio != null) {
        expect(chipRatio, `${theme} status chip`).toBeGreaterThanOrEqual(UI_CHROME_MIN);
      }
    });
  });
}

test("recovery codes contrast after registration", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const suffix = Date.now().toString(36).slice(-6);
  const user = `ctrst${suffix}`;
  const pass = "AcceptTest!2026ui";
  let response;
  try {
    response = await page.goto(baseURL + "/register", {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
  } catch (error) {
    testInfo.skip(true, `NETWORK_UNAVAILABLE: ${error}`);
    return;
  }
  if (!response || response.status() >= 500) {
    testInfo.skip(true, `NETWORK_UNAVAILABLE: HTTP ${response?.status()}`);
    return;
  }
  await page.locator("#account-login").waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(1500);
  await page.locator("#account-login").click();
  await page.locator("#account-login").fill("");
  await page.locator("#account-login").pressSequentially(user, { delay: 15 });
  await page.locator("#account-password").click();
  await page.locator("#account-password").fill(pass);
  await page.locator("#account-confirmation").click();
  await page.locator("#account-confirmation").fill(pass);
  await page.getByRole("button", { name: /создать аккаунт/i }).click();
  const code = page.locator(".recovery-codes code").first();
  try {
    await code.waitFor({ state: "visible", timeout: 45_000 });
  } catch {
    const msg = (
      (await page.locator(".account-error").first().textContent().catch(() => "")) ||
      ""
    ).trim();
    if (/503|unavailable|недоступен/i.test(msg)) {
      testInfo.skip(true, `NETWORK_UNAVAILABLE: ${msg}`);
      return;
    }
    throw new Error(`PRODUCT_REGRESSION: recovery codes missing${msg ? `: ${msg}` : ""}`);
  }
  const sampleCode = await sample(page, ".recovery-codes code");
  const ratio = ratioFromSample(sampleCode);
  expect(ratio, "recovery code contrast").not.toBeNull();
  expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL);
});
