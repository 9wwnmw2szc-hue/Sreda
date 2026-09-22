import { test } from "node:test";
import assert from "node:assert/strict";
import {
  relativeLuminance,
  contrastRatio,
  AA_NORMAL,
  AA_LARGE,
  UI_CHROME_MIN,
} from "../src/lib/contrast.ts";

test("relativeLuminance: black is 0, white is 1", () => {
  assert.equal(relativeLuminance("#000000"), 0);
  assert.equal(relativeLuminance("#ffffff"), 1);
  assert.equal(relativeLuminance({ r: 0, g: 0, b: 0 }), 0);
  assert.equal(relativeLuminance({ r: 255, g: 255, b: 255 }), 1);
});

test("contrastRatio: white on black and black on white are >= 20", () => {
  assert.ok(contrastRatio("#ffffff", "#000000") >= 20);
  assert.ok(contrastRatio("#000000", "#ffffff") >= 20);
  assert.ok(Math.abs(contrastRatio("#fff", "#000") - 21) < 0.1);
});

test("brand text #20252B on #F6C344 passes AA for normal and large text", () => {
  const ratio = contrastRatio("#20252B", "#F6C344");
  assert.ok(
    ratio >= AA_NORMAL,
    `expected >= ${AA_NORMAL} for normal text, got ${ratio.toFixed(2)}`,
  );
  assert.ok(
    ratio >= AA_LARGE,
    `expected >= ${AA_LARGE} for large text, got ${ratio.toFixed(2)}`,
  );
});

test("severe UI chrome fails when ratio < 3", () => {
  // Light gray on white — typical low-contrast chrome failure
  const weak = contrastRatio("#C8C8C8", "#FFFFFF");
  assert.ok(weak < UI_CHROME_MIN, `expected severe fail (<3), got ${weak}`);

  // Near-identical yellows
  const washed = contrastRatio("#F0D060", "#F6C344");
  assert.ok(
    washed < UI_CHROME_MIN,
    `expected severe fail (<3), got ${washed}`,
  );
});
