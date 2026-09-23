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
  "/leads/concept",
  "/orders",
  "/bookings",
  "/calendar",
  "/messages",
  "/posts",
  "/clients",
  "/analytics",
  "/notifications",
  // Canonical connections surface (not /connections — that redirects)
  "/settings?section=connections",
  "/billing",
  "/onboarding",
  ...SETTINGS_SECTIONS.filter((s) => s !== "connections").map(
    (s) => `/settings?section=${s}`,
  ),
  "/settings/advanced",
  "/__not_found__",
];

/** Soft redirect assertion — separate from UI failure. */
const REDIRECT_ASSERTIONS = [
  {
    from: "/connections",
    toPath: "/settings",
    toSearchIncludes: "section=connections",
  },
];

/** Dark theme only for a key subset to keep runtime bounded. */
const DARK_ROUTES = new Set([
  "/login",
  "/register",
  "/dashboard",
  "/settings?section=business",
  "/messages",
  "/solutions",
  "/leads/concept",
]);

const MOBILE_MAX = 699;
const TOUCH_MIN = 44;
const OVERFLOW_SLOP = 1;
const ignoreHttps =
  process.env.AUDIT_IGNORE_HTTPS_ERRORS === "1" ||
  /^https:\/\/127\.0\.0\.1(?::\d+)?/i.test(baseUrl);

function routeUrl(route) {
  if (route === "/__not_found__") return `${baseUrl}/__ui-audit-not-found__`;
  return `${baseUrl}${route}`;
}

function expectedPathname(route) {
  if (route === "/__not_found__") return null;
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
    async ({ mobile, protectedWithAuth, touchMin, overflowSlop }) => {
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
        let widest = null;
        let widestRight = 0;
        for (const el of document.querySelectorAll("body *")) {
          if (!(el instanceof HTMLElement)) continue;
          const r = el.getBoundingClientRect();
          if (r.width < 1 || r.height < 1) continue;
          if (r.right > widestRight) {
            widestRight = r.right;
            widest = el;
          }
        }
        if (widest) {
          const tag = widest.tagName.toLowerCase();
          const cls = (widest.className || "").toString().slice(0, 60);
          failures.push(
            `body-overflow-x-offender: <${tag}.${cls}> right=${Math.round(widestRight)}`,
          );
        }
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

      // Interactive clipping: fail only when content is actually horizontally clipped
      for (const el of document.querySelectorAll(
        "button, .button, a.button, [role='button']",
      )) {
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
        const delta = el.scrollWidth - el.clientWidth;
        if (delta <= overflowSlop) continue;
        const nowrap = style.whiteSpace === "nowrap" || style.whiteSpace === "pre";
        const clips =
          style.overflowX === "hidden" ||
          style.overflowX === "clip" ||
          style.overflow === "hidden" ||
          style.overflow === "clip";
        const label = (el.textContent || el.getAttribute("aria-label") || "")
          .trim()
          .slice(0, 40);
        // Wrapping text with overflow:visible often has benign scrollWidth quirks
        // (text-wrap:balance). Only fail for nowrap or actually clipped overflow.
        if (!nowrap && !clips) {
          if (delta > 4) {
            warnings.push(
              `interactive-clipping-soft: "${label}" Δ=${delta}`,
            );
          }
          continue;
        }
        failures.push(
          `interactive-clipping: "${label}" scrollWidth=${el.scrollWidth} clientWidth=${el.clientWidth}`,
        );
      }

      // Input font-size on mobile — text-like controls only (iOS zoom)
      if (mobile) {
        const TEXT_TYPES = new Set([
          "text",
          "search",
          "email",
          "tel",
          "url",
          "password",
          "number",
          "date",
          "datetime-local",
          "time",
          "month",
          "week",
          "",
        ]);
        for (const el of document.querySelectorAll(
          "input, textarea, select",
        )) {
          if (!(el instanceof HTMLElement)) continue;
          if (el instanceof HTMLInputElement) {
            const t = (el.type || "text").toLowerCase();
            if (!TEXT_TYPES.has(t)) continue;
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

      // Touch targets: strict failure only on mobile/touch surfaces
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
          if (!mobile) {
            warnings.push(`desktop-${msg}`);
            continue;
          }
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
        window.scrollTo(0, document.documentElement.scrollHeight);
        scrolling.scrollTop = scrolling.scrollHeight;
        await new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        );
        await new Promise((r) => setTimeout(r, 50));
        const navRect = bottomNav.getBoundingClientRect();
        const main =
          document.querySelector("#main-content") ||
          document.querySelector(".app-main") ||
          document.querySelector("main") ||
          document.body;
        const mainStyle = getComputedStyle(main);
        const padBottom = parseFloat(mainStyle.paddingBottom) || 0;
        if (padBottom + 1 < navRect.height) {
          warnings.push(
            `bottom-nav-clearance: main padding-bottom=${Math.round(padBottom)} navHeight=${Math.round(navRect.height)}`,
          );
        }

        function inFloatingChrome(el) {
          let node = el;
          while (node && node !== document.documentElement) {
            if (!(node instanceof HTMLElement)) break;
            if (
              node.classList.contains("mobile-bottom-nav") ||
              node.classList.contains("sticky-save-bar") ||
              node.classList.contains("mobile-header") ||
              node.classList.contains("desktop-topbar")
            ) {
              return true;
            }
            const st = getComputedStyle(node);
            if (st.position === "fixed" || st.position === "sticky") return true;
            if (st.transform !== "none" && st.transform !== "matrix(1, 0, 0, 1, 0, 0)") {
              // transformed ancestors make document Y unreliable vs scrollHeight
              return true;
            }
            node = node.parentElement;
          }
          return false;
        }

        const scrollHeight = Math.max(
          document.documentElement.scrollHeight,
          document.body?.scrollHeight ?? 0,
        );
        const need = Math.ceil(navRect.height) + 8;
        const candidates = [
          ...document.querySelectorAll(
            "#main-content a.button, #main-content button.button, #main-content .button, .panel .button",
          ),
        ]
          .filter((el) => {
            if (!(el instanceof HTMLElement)) return false;
            if (inFloatingChrome(el)) return false;
            const st = getComputedStyle(el);
            if (st.display === "none" || st.visibility === "hidden") return false;
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          })
          .map((el) => {
            const r = el.getBoundingClientRect();
            const docBottom = r.bottom + (window.scrollY || 0);
            return {
              el,
              docBottom,
              clearance: scrollHeight - docBottom,
              label: (el.textContent || "").trim().slice(0, 36),
            };
          })
          // Only in-flow content that participates in document height
          .filter((c) => c.clearance >= -2)
          .sort((a, b) => b.docBottom - a.docBottom);

        if (candidates.length) {
          const last = candidates[0];
          if (last.clearance + 0.5 < need) {
            failures.push(
              `overlap-bottom-nav: "${last.label}" clearance=${Math.round(last.clearance)} need=${need} pad=${Math.round(padBottom)}`,
            );
          }
        }
        scrolling.scrollTop = prevTop;
      }

      // Geometry: label text vs control — never use wrapping <label> box alone
      for (const label of document.querySelectorAll("label")) {
        if (!(label instanceof HTMLElement)) continue;
        if (label.closest(".business-switcher")) continue;
        const st = getComputedStyle(label);
        if (st.display === "none" || st.visibility === "hidden") continue;
        const forId = label.getAttribute("for");
        let control = forId ? document.getElementById(forId) : null;
        if (!control) {
          control = label.querySelector("input, select, textarea");
        }
        if (!control || !(control instanceof HTMLElement)) continue;
        if (
          control.matches('input[type="checkbox"], input[type="radio"]')
        ) {
          continue;
        }
        let textEl = null;
        if (label.contains(control)) {
          textEl = label.querySelector(".field__label");
          if (!textEl) continue; // no explicit label text → skip container label
        } else if (label.classList.contains("field__label") || forId) {
          textEl = label;
        } else {
          continue;
        }
        const lr = textEl.getBoundingClientRect();
        const cr = control.getBoundingClientRect();
        if (lr.height < 1 || cr.height < 1) continue;
        if (rectsOverlap(lr, cr, 1)) {
          failures.push(
            `overlap-label-input: "${(textEl.textContent || "").trim().slice(0, 32)}"`,
          );
        }
      }

      // BusinessSwitcher name vs chevron (precise selectors only)
      const switcher = document.querySelector(".business-switcher");
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
let warningCount = 0;

try {
  // Redirect assertions (canonical /connections → settings)
  if (storageState) {
    for (const assertion of REDIRECT_ASSERTIONS) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        storageState,
        ignoreHTTPSErrors: ignoreHttps,
      });
      const page = await context.newPage();
      const failures = [];
      const warnings = [];
      try {
        await page.goto(routeUrl(assertion.from), {
          waitUntil: "domcontentloaded",
          timeout: 60_000,
        });
        await page.waitForTimeout(300);
        const url = new URL(page.url());
        if (url.pathname !== assertion.toPath) {
          failures.push(
            `redirect: ${assertion.from} → expected path ${assertion.toPath}, got ${url.pathname}`,
          );
        } else if (
          assertion.toSearchIncludes &&
          !url.search.includes(assertion.toSearchIncludes)
        ) {
          failures.push(
            `redirect: ${assertion.from} → missing ${assertion.toSearchIncludes} in ${url.search}`,
          );
        }
      } catch (error) {
        failures.push(
          `redirect-error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      results.push({
        route: assertion.from,
        viewport: { width: 390, height: 844 },
        theme: "light",
        status: 200,
        pathname: "redirect-check",
        failures,
        warnings,
      });
      if (failures.length) failureCount += 1;
      await context.close();
    }
  }

  for (const viewport of VIEWPORTS) {
    for (const route of ROUTES) {
      for (const theme of themesFor(route)) {
        const context = await browser.newContext({
          viewport,
          colorScheme: theme === "dark" ? "dark" : "light",
          ignoreHTTPSErrors: ignoreHttps,
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
            // Self-induced rate limits / missing optional assets → warnings
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
        warningCount += warnings.length;

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
  warningCount,
  checkedSha: process.env.GITHUB_SHA || null,
  baseUrl,
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
