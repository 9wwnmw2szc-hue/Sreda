import assert from "node:assert/strict";
import { describe, it, after } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import dns from "node:dns";
import { preferIpv4Dns } from "../src/server/net/ipv4-first.ts";
import { SolutionService } from "../src/server/solutions/service.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** @param {unknown} svc */
function flags(svc) {
  return /** @type {{ telegramEnabled: boolean, vkEnabled: boolean }} */ (svc);
}

describe("telegram compat: feature flags + ipv4 dns", () => {
  const prevTg = process.env.TELEGRAM_WEBHOOKS_ENABLED;
  const prevVk = process.env.VK_WEBHOOKS_ENABLED;

  after(() => {
    if (prevTg === undefined) delete process.env.TELEGRAM_WEBHOOKS_ENABLED;
    else process.env.TELEGRAM_WEBHOOKS_ENABLED = prevTg;
    if (prevVk === undefined) delete process.env.VK_WEBHOOKS_ENABLED;
    else process.env.VK_WEBHOOKS_ENABLED = prevVk;
  });

  it("SolutionService reads TELEGRAM/VK env when flags omitted", () => {
    process.env.TELEGRAM_WEBHOOKS_ENABLED = "true";
    process.env.VK_WEBHOOKS_ENABLED = "false";
    const svc = new SolutionService(/** @type {never} */ ({}));
    assert.equal(flags(svc).telegramEnabled, true);
    assert.equal(flags(svc).vkEnabled, false);
  });

  it("SolutionService keeps explicit false even when env is true", () => {
    process.env.TELEGRAM_WEBHOOKS_ENABLED = "true";
    process.env.VK_WEBHOOKS_ENABLED = "true";
    const svc = new SolutionService(/** @type {never} */ ({}), false, false);
    assert.equal(flags(svc).telegramEnabled, false);
    assert.equal(flags(svc).vkEnabled, false);
  });

  it("preferIpv4Dns sets ipv4first", () => {
    preferIpv4Dns();
    assert.equal(dns.getDefaultResultOrder(), "ipv4first");
  });

  it("connection connect maps AbortError to timed-out copy", () => {
    const src = readFileSync(
      join(root, "src/server/connections/service.ts"),
      "utf8",
    );
    assert.match(src, /Telegram не ответил вовремя/);
    assert.match(src, /CHANNEL_UNAVAILABLE/);
  });

  it("solution-handler falls back to env for telegramEnabled", () => {
    const src = readFileSync(
      join(root, "src/server/http/solution-handler.ts"),
      "utf8",
    );
    assert.match(src, /TELEGRAM_WEBHOOKS_ENABLED === "true"/);
  });

  it("workers and runtime prefer ipv4 dns", () => {
    for (const rel of [
      "src/server/runtime.ts",
      "src/instrumentation.ts",
      "scripts/telegram-worker.mts",
      "scripts/vk-worker.mts",
    ]) {
      const src = readFileSync(join(root, rel), "utf8");
      assert.match(src, /preferIpv4Dns|ipv4-first/, rel);
    }
  });
});
