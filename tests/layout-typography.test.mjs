import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("..", import.meta.url);
const cssPath = new URL("../src/app/globals.css", import.meta.url);

async function walkTsx(dir, out = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      await walkTsx(full, out);
    } else if (/\.(tsx|ts|jsx|js|css|mjs)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

test("design tokens define typography and spacing scales", async () => {
  const css = await readFile(cssPath, "utf8");
  for (const token of [
    "--font-size-page",
    "--font-size-section",
    "--font-size-card",
    "--font-size-body",
    "--font-size-body-sm",
    "--font-size-label",
    "--font-size-caption",
    "--font-size-badge",
    "--line-height-tight",
    "--line-height-snug",
    "--line-height-body",
    "--line-height-relaxed",
    "--space-1",
    "--space-2",
    "--space-3",
    "--space-4",
    "--space-5",
    "--space-6",
    "--space-8",
    "--space-10",
    "--space-12",
    "--space-16",
    "--font-weight-regular",
    "--font-weight-medium",
    "--font-weight-semibold",
    "--font-weight-bold",
  ]) {
    assert.match(css, new RegExp(`${token}:`));
  }
  assert.match(css, /\.text-page-title\s*\{/);
  assert.match(css, /\.text-section-title\s*\{/);
  assert.match(css, /\.text-card-title\s*\{/);
  assert.match(css, /\.card-layout\s*\{/);
  assert.match(css, /\.stack-md\s*\{/);
});

test("cards use content-driven heights, not fixed mobile clamps", async () => {
  const css = await readFile(cssPath, "utf8");
  assert.equal(/\.solution-card\s*\{[^}]*min-height:\s*82px/s.test(css), false);
  assert.equal(
    /\.catalog-grid\s+\.solution-card\s*\{[^}]*min-height:\s*85px/s.test(css),
    false,
  );
  assert.equal(/\.setup-option[^}]*min-height:\s*82px/s.test(css), false);
  assert.equal(/\.industry-card\s*\{[^}]*min-height:\s*96px/s.test(css), false);
  assert.match(css, /\.solution-card\s*\{[^}]*min-height:\s*0/s);
  assert.match(css, /\.industry-card\s*\{[^}]*min-height:\s*0/s);
});

test("recommended state has no thick border chrome", async () => {
  const css = await readFile(cssPath, "utf8");
  assert.equal(
    /\.is-recommended[^{]*\{[^}]*(border-width:\s*[2-9]px|outline:\s*[2-9]px|box-shadow:\s*0\s*0\s*0\s*[2-9]px)/s.test(
      css,
    ),
    false,
  );
  assert.match(css, /\.is-recommended/);
  assert.match(css, /\.solution-card\.is-selected/);
  assert.match(css, /\.industry-card\.is-selected/);
});

test("UI sources do not render «Рекомендуем» badge copy", async () => {
  const files = await walkTsx(new URL("../src", import.meta.url).pathname);
  const offenders = [];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    if (text.includes("Рекомендуем") || text.includes("recommend-badge")) {
      offenders.push(file.replace(root.pathname, ""));
    }
  }
  assert.deepEqual(offenders, []);
});

test("schedule mode label does not nudge with «рекомендуем»", async () => {
  const panel = await readFile(
    new URL("../src/components/booking/AutoSchedulePanel.tsx", import.meta.url),
    "utf8",
  );
  assert.equal(panel.toLowerCase().includes("рекомендуем"), false);
  assert.match(panel, /Автоматическое расписание \(по умолчанию\)/);
  assert.match(panel, /Вручную \(расширенный режим\)/);
});

test("catalog and solution cards prefer wrap-safe typography tokens", async () => {
  const css = await readFile(cssPath, "utf8");
  assert.match(css, /\.catalog-card__body\s*\{[^}]*gap:\s*var\(--space-3\)/s);
  assert.match(
    css,
    /\.catalog-card h2[\s\S]*?overflow-wrap:\s*anywhere/s,
  );
  assert.match(
    css,
    /\.solution-card__text strong[\s\S]*?overflow-wrap:\s*anywhere/s,
  );
  assert.match(css, /\.status-chip\s*\{[^}]*font-size:\s*var\(--font-size-badge\)/s);
});
