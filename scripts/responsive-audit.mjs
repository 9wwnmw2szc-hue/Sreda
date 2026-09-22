/**
 * Systemic responsive / UI audit for «Соты».
 * Env:
 *   AUDIT_BASE_URL       default http://127.0.0.1:3000
 *   AUDIT_STORAGE_STATE  Playwright storageState JSON path (auth)
 *   AUDIT_OUTPUT         report directory (default /tmp/soty-responsive-audit)
 */
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.AUDIT_BASE_URL ?? "http://127.0.0.1:3000";
const output = process.env.AUDIT_OUTPUT ?? "/tmp/soty-responsive-audit";
const storageState = process.env.AUDIT_STORAGE_STATE;

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 360, height: 800 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 393, height: 852 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 820, height: 1180 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

const SETTINGS_SECTIONS = [
  "business",
  "solutions",
  "connections",
  "notifications",
  "ai",
  "billing",
  "account",
  "danger",
];

const PUBLIC_ROUTES = new Set([
  "/login",
  "/register",
  "/recover",
  "/__not_found__",
]);

const ROUTES = [
  "/login",
  "/register",
  "/recover",
  "/business/new",
  "/dashboard",
  "/solutions",
  "/solutions/leads/setup",
  "/leads",
  "/orders",
  "/bookings",
  "/calendar",
  "/messages",
  "/posts",
  "/clients",
  "/analytics",
  "/notifications",
  "/connections",
  "/billing",
  "/onboarding",
  ...SETTINGS_SECTIONS.map((s) => `/settings?section=${s}`),
  "/settings/advanced",
  "/__not_found__",
];

/** Dark theme only for a key subset to keep runtime bounded. */
const DARK_ROUTES = new Set([
  "/login",
  "/register",
  "/dashboard",
  "/settings?section=business",
  "/messages",
  "/solutions",
]);

const MOBILE_MAX = 699;
const TOUCH_MIN = 44;
const OVERFLOW_SLOP = 1;

function routeUrl(route) {
  if (route === "/__not_found__") return `${baseUrl}/__ui-audit-not-found__`;
  return `${baseUrl}${route}`;
}

function expectedPathname(route) {
  if (route === "/__not_found__") return null; // any 404 path is fine
  if (route === "/connections") return "/settings"; // canonical redirect
  return route.split("?")[0];
}

function isProtected(route) {
  return !PUBLIC_ROUTES.has(route) && route !== "/__not_found__";
}

function themesFor(route) {
  return DARK_ROUTES.has(route) ? ["light", "dark"] : ["light"];
}

async function applyTheme(page, theme) {
  await page.addInitScript((t) => {
    try {
      localStorage.setItem("soty.theme", t);
      document.documentElement.dataset.theme = t;
      document.documentElement.style.colorScheme = t;
    } catch {
      /* ignore */
    }
  }, theme);
}

async function collectMetrics(page, { mobile, protectedWithAuth }) {
  return page.evaluate(
    ({ mobile, protectedWithAuth, touchMin, overflowSlop }) => {
      const failures = [];
      const warnings = [];

      const doc = document.documentElement;
      const body = document.body;
      const overflowX =
        doc.scrollWidth > doc.clientWidth + overflowSlop ||
        (body && body.scrollWidth > doc.clientWidth + overflowSlop);
      if (overflowX) {
        failures.push(
          `body-overflow-x: scrollWidth=${Math.max(doc.scrollWidth, body?.scrollWidth ?? 0)} clientWidth=${doc.clientWidth}`,
        );
      }

      // .button must not use overflow-wrap: anywhere (mid-word wrapping)
      for (const el of document.querySelectorAll(".button")) {
        const wrap = getComputedStyle(el).overflowWrap;
        if (wrap === "anywhere") {
          const label = (el.textContent || "").trim().slice(0, 40);
          failures.push(
            `button-overflow-wrap-anywhere: "${label}"`,
          );
        }
      }

      // Interactive clipping: buttons whose content overflows horizontally
      for (const el of document.querySelectorAll(
        "button, .button, a.button, [role='button']",
      )) {
        if (!(el instanceof HTMLElement)) continue;
        if (el.scrollWidth > el.clientWidth + overflowSlop) {
          const label = (el.textContent || el.getAttribute("aria-label") || "")
            .trim()
            .slice(0, 40);
          failures.push(
            `interactive-clipping: "${label}" scrollWidth=${el.scrollWidth} clientWidth=${el.clientWidth}`,
          );
        }
      }

      // Input font-size on mobile (iOS zoom prevention for text entry)
      if (mobile) {
        for (const el of document.querySelectorAll(
          "input, textarea, select",
        )) {
          if (!(el instanceof HTMLElement)) continue;
          if (
            el instanceof HTMLInputElement &&
            (el.type === "checkbox" ||
              el.type === "radio" ||
              el.type === "hidden" ||
              el.type === "range" ||
              el.type === "file" ||
              el.type === "button" ||
              el.type === "submit" ||
              el.type === "reset" ||
              el.type === "image" ||
              el.type === "color")
          ) {
            continue;
          }
          const style = getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") continue;
          const fontSize = parseFloat(style.fontSize) || 0;
          if (fontSize > 0 && fontSize < 16) {
            const name =
              el.getAttribute("name") ||
              el.getAttribute("id") ||
              el.getAttribute("type") ||
              "input";
            failures.push(
              `input-font-size: ${name} font-size=${fontSize}px (<16)`,
            );
          }
        }
      }

      // Touch targets for standalone buttons / button-links / nav controls
      const touchCandidates = document.querySelectorAll(
        "button:not([disabled]), a.button, nav a, nav button, .icon-button, [role='button']",
      );
      for (const el of touchCandidates) {
        if (!(el instanceof HTMLElement)) continue;
        const style = getComputedStyle(el);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          style.pointerEvents === "none"
        ) {
          continue;
        }
        const rect = el.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) continue;
        // Skip text links inside paragraphs — only "standalone" / nav / button-like
        const isNav = Boolean(el.closest("nav"));
        const isButtonLike =
          el.matches("button, .button, a.button, .icon-button, [role='button']");
        if (!isNav && !isButtonLike) continue;
        if (rect.width < touchMin || rect.height < touchMin) {
          const label = (
            el.getAttribute("aria-label") ||
            el.textContent ||
            ""
          )
            .trim()
            .slice(0, 40);
          const msg = `touch-target: "${label}" ${Math.round(rect.width)}×${Math.round(rect.height)} (<${touchMin})`;
          // Icon-only / dense nav often warn; primary .button fails
          if (el.classList.contains("button") && !el.classList.contains("icon-button")) {
            failures.push(msg);
          } else {
            warnings.push(msg);
          }
        }
      }

      // Dialog bounds — open dialogs must stay inside the viewport
      for (const el of document.querySelectorAll(
        "dialog[open], [role='dialog'], [aria-modal='true']",
      )) {
        if (!(el instanceof HTMLElement)) continue;
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") continue;
        const rect = el.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        if (
          rect.left < -2 ||
          rect.top < -2 ||
          rect.right > vw + 2 ||
          rect.bottom > vh + 2
        ) {
          failures.push(
            `dialog-bounds: left=${Math.round(rect.left)} top=${Math.round(rect.top)} right=${Math.round(rect.right)} bottom=${Math.round(rect.bottom)} vw=${vw} vh=${vh}`,
          );
        }
      }

      function rectsOverlap(a, b, pad = 0) {
        return !(
          a.right <= b.left + pad ||
          a.left >= b.right - pad ||
          a.bottom <= b.top + pad ||
          a.top >= b.bottom - pad
        );
      }

      // Geometry: bottom nav must not cover last interactive content (after scroll)
      const bottomNav = document.querySelector(".mobile-bottom-nav");
      if (bottomNav && getComputedStyle(bottomNav).display !== "none") {
        const scrolling = document.scrollingElement || document.documentElement;
        const prevTop = scrolling.scrollTop;
        scrolling.scrollTop = scrolling.scrollHeight;
        const navRect = bottomNav.getBoundingClientRect();
        const interactives = [
          ...document.querySelectorAll(
            "main button, main .button, main a.button, .sticky-save-bar .button, .panel .button",
          ),
        ].filter((el) => {
          if (!(el instanceof HTMLElement)) return false;
          if (el.closest(".mobile-bottom-nav")) return false;
          const st = getComputedStyle(el);
          if (st.display === "none" || st.visibility === "hidden") return false;
          const r = el.getBoundingClientRect();
          // Only in-viewport after scroll-to-bottom
          return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
        });
        if (interactives.length) {
          const last = interactives.reduce((best, el) => {
            const r = el.getBoundingClientRect();
            const br = best.getBoundingClientRect();
            return r.bottom > br.bottom ? el : best;
          });
          const lastRect = last.getBoundingClientRect();
          if (rectsOverlap(lastRect, navRect, -1) && lastRect.bottom > navRect.top + 2) {
            const label = (last.textContent || "").trim().slice(0, 36);
            failures.push(
              `overlap-bottom-nav: "${label}" bottom=${Math.round(lastRect.bottom)} navTop=${Math.round(navRect.top)}`,
            );
          }
        }
        scrolling.scrollTop = prevTop;
      }

      // Geometry: external label must not overlap its control (skip wrapping labels)
      for (const label of document.querySelectorAll("label")) {
        if (!(label instanceof HTMLElement)) continue;
        const st = getComputedStyle(label);
        if (st.display === "none" || st.visibility === "hidden") continue;
        const forId = label.getAttribute("for");
        let control = forId ? document.getElementById(forId) : null;
        if (!control) {
          control = label.querySelector("input, select, textarea");
        }
        if (!control || !(control instanceof HTMLElement)) continue;
        // Wrapping labels always "overlap" their control's bounding box
        if (label.contains(control)) continue;
        const lr = label.getBoundingClientRect();
        const cr = control.getBoundingClientRect();
        if (lr.height < 1 || cr.height < 1) continue;
        if (rectsOverlap(lr, cr, 1) && Math.abs(lr.top - cr.top) > 4) {
          failures.push(
            `overlap-label-input: "${(label.textContent || "").trim().slice(0, 32)}"`,
          );
        }
      }

      // BusinessSwitcher name vs chevron (precise selectors only)
      const switcher = document.querySelector(
        ".business-switcher, [data-business-switcher]",
      );
      if (switcher) {
        const nameEl = switcher.querySelector(".business-switcher__name");
        const chevron = switcher.querySelector(".business-switcher__chevron");
        if (nameEl && chevron) {
          const nr = nameEl.getBoundingClientRect();
          const cr = chevron.getBoundingClientRect();
          if (nr.width > 0 && cr.width > 0 && rectsOverlap(nr, cr, 2)) {
            failures.push("overlap-business-switcher: name crosses chevron");
          }
        }
      }

      // Mobile search field vs close
      const searchField = document.querySelector(
        ".soty-command__field, .soty-command__sheet .soty-command__field",
      );
      const searchClose = document.querySelector(".soty-command__close");
      if (searchField && searchClose) {
        const fr = searchField.getBoundingClientRect();
        const cr = searchClose.getBoundingClientRect();
        if (
          fr.width > 0 &&
          cr.width > 0 &&
          getComputedStyle(searchClose).display !== "none" &&
          rectsOverlap(fr, cr, 2)
        ) {
          failures.push("overlap-command-search: field crosses close");
        }
      }

      // Sticky save bar vs bottom nav
      const sticky = document.querySelector(".sticky-save-bar");
      if (
        sticky &&
        bottomNav &&
        getComputedStyle(sticky).display !== "none" &&
        getComputedStyle(bottomNav).display !== "none"
      ) {
        const sr = sticky.getBoundingClientRect();
        const nr = bottomNav.getBoundingClientRect();
        if (sr.height > 0 && nr.height > 0 && rectsOverlap(sr, nr, 1)) {
          failures.push("overlap-sticky-save-bottom-nav");
        }
      }

      return {
        pathname: location.pathname + location.search,
        pathOnly: location.pathname,
        overflowX: Boolean(overflowX),
        failures,
        warnings,
        protectedWithAuth,
      };
    },
    { mobile, protectedWithAuth, touchMin: TOUCH_MIN, overflowSlop: OVERFLOW_SLOP },
  );
}

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
let failureCount = 0;

try {
  for (const viewport of VIEWPORTS) {
    for (const route of ROUTES) {
      for (const theme of themesFor(route)) {
        const context = await browser.newContext({
          viewport,
          colorScheme: theme === "dark" ? "dark" : "light",
          ...(storageState ? { storageState } : {}),
        });
        const page = await context.newPage();
        await applyTheme(page, theme);

        const consoleErrors = [];
        const pageErrors = [];
        page.on("pageerror", (error) =>
          pageErrors.push(error.message || String(error)),
        );
        page.on("console", (message) => {
          if (message.type() === "error") {
            consoleErrors.push(message.text());
          }
        });

        const failures = [];
        const warnings = [];
        let status = 0;
        let pathname = "";

        try {
          const response = await page.goto(routeUrl(route), {
            waitUntil: "domcontentloaded",
            timeout: 60_000,
          });
          status = response?.status() ?? 0;
          await page.waitForTimeout(200);

          // Re-apply theme after navigation in case bootstrap overwrote it
          await page.evaluate((t) => {
            try {
              localStorage.setItem("soty.theme", t);
              document.documentElement.dataset.theme = t;
              document.documentElement.style.colorScheme = t;
            } catch {
              /* ignore */
            }
          }, theme);

          const metrics = await collectMetrics(page, {
            mobile: viewport.width <= MOBILE_MAX,
            protectedWithAuth: Boolean(storageState) && isProtected(route),
          });
          pathname = metrics.pathOnly || metrics.pathname;

          if (status >= 400 && route !== "/__not_found__") {
            failures.push(`http-status: ${status}`);
          }
          if (route === "/__not_found__" && status !== 404 && status < 400) {
            warnings.push(
              `not-found: expected 404, got ${status} at ${pathname}`,
            );
          }

          const expected = expectedPathname(route);
          if (
            expected &&
            route !== "/__not_found__" &&
            !pathname.startsWith(expected)
          ) {
            if (storageState && isProtected(route)) {
              failures.push(
                `pathname-mismatch: expected ${expected}, got ${pathname}`,
              );
            } else {
              warnings.push(
                `pathname-mismatch: expected ${expected}, got ${pathname}`,
              );
            }
          }

          // Protected route with storage must not bounce to /login
          if (storageState && isProtected(route) && pathname === "/login") {
            failures.push(
              "protected-route-redirect: landed on /login with storage state",
            );
          }

          for (const err of pageErrors) {
            failures.push(`page-error: ${err}`);
          }
          for (const err of consoleErrors) {
            // Filter noisy Next.js / hydration noise that is not actionable
            if (/Download the React DevTools/i.test(err)) continue;
            // Staging rate-limits / missing optional assets must not fail the gate
            if (
              /status of 429|status of 404|net::ERR_|Failed to load resource/i.test(
                err,
              )
            ) {
              warnings.push(`console-warning: ${err}`);
              continue;
            }
            failures.push(`console-error: ${err}`);
          }

          failures.push(...metrics.failures);
          warnings.push(...metrics.warnings);
        } catch (error) {
          failures.push(
            `navigation-error: ${error instanceof Error ? error.message : String(error)}`,
          );
        }

        const result = {
          route,
          viewport: { width: viewport.width, height: viewport.height },
          theme,
          status,
          pathname,
          failures,
          warnings,
        };
        results.push(result);
        if (failures.length) failureCount += 1;

        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}

const reportPath = `${output}/report.json`;
await writeFile(reportPath, JSON.stringify(results, null, 2));

const summary = {
  checked: results.length,
  withFailures: failureCount,
  output: reportPath,
  sampleFailures: results
    .filter((r) => r.failures.length)
    .slice(0, 20)
    .map((r) => ({
      route: r.route,
      viewport: r.viewport,
      theme: r.theme,
      failures: r.failures,
    })),
};

console.log(JSON.stringify(summary, null, 2));
if (failureCount > 0) process.exitCode = 1;
