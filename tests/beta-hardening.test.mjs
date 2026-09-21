import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { Kysely, PGliteDialect, PostgresDialect } from "kysely";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import { migrate } from "../src/server/db/migrate.ts";
import { limit } from "../src/server/http/limits.ts";
import { AppError, respond } from "../src/server/http/errors.ts";
import {
  maybeNotifyLowStock,
  evaluateLowStockCrossing,
} from "../src/server/orders/low-stock.ts";

const usePg = !!process.env.TEST_DATABASE_URL;
const db = new Kysely({
  dialect: usePg
    ? new PostgresDialect({
        pool: new Pool({
          connectionString: process.env.TEST_DATABASE_URL,
          max: 4,
        }),
      })
    : new PGliteDialect({ pglite: new PGlite() }),
});
const secret = "beta-hardening-rate-limit-secret!!";

before(() => migrate(db, new URL("../migrations", import.meta.url).pathname));
after(() => db.destroy());

function isRateLimited(error) {
  return (
    error &&
    typeof error === "object" &&
    error.status === 429 &&
    error.code === "RATE_LIMITED"
  );
}

test("request_limit rejects after max attempts in the window", async () => {
  const subject = "test:auth:login:" + crypto.randomUUID();
  for (let i = 0; i < 3; i++) await limit(db, secret, subject, 3, 600);
  await assert.rejects(
    () => limit(db, secret, subject, 3, 600),
    isRateLimited,
  );
});

test("request_limit subjects are isolated", async () => {
  const a = "test:auth:login:a-" + crypto.randomUUID();
  const b = "test:auth:login:b-" + crypto.randomUUID();
  for (let i = 0; i < 5; i++) await limit(db, secret, a, 5, 600);
  await assert.rejects(() => limit(db, secret, a, 5, 600), isRateLimited);
  await limit(db, secret, b, 5, 600);
});

test("respond accepts x-request-id and returns it on errors", async () => {
  const id = "client-corr-id-abc12345";
  const request = new Request("https://example.test/api", {
    headers: { "x-request-id": id },
  });
  const response = await respond(request, async () => {
    throw new AppError(400, "TEST", "fail");
  });
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("x-request-id"), id);
  const body = await response.json();
  assert.equal(body.error.requestId, id);
  assert.equal(body.error.request_id, id);
});

test("respond mints UUID when x-request-id missing", async () => {
  const response = await respond(new Request("https://example.test/api"), async () => {
    throw new AppError(404, "NOT_FOUND", "missing");
  });
  const id = response.headers.get("x-request-id");
  assert.match(id ?? "", /^[0-9a-f-]{36}$/i);
  const body = await response.json();
  assert.equal(body.error.requestId, id);
});

test("low_stock_threshold column exists after migration 053", async () => {
  const { sql } = await import("kysely");
  await sql`select low_stock_threshold from product limit 0`.execute(db);
});

test("low-stock crossing is dedupe-keyed and only fires on downward cross", () => {
  assert.equal(
    evaluateLowStockCrossing({
      productId: "p1",
      previousStock: 10,
      nextStock: 5,
      threshold: 5,
    }).crossed,
    true,
  );
  assert.equal(
    evaluateLowStockCrossing({
      productId: "p1",
      previousStock: 5,
      nextStock: 4,
      threshold: 5,
    }).crossed,
    false,
  );
  assert.equal(
    evaluateLowStockCrossing({
      productId: "p1",
      previousStock: 10,
      nextStock: 6,
      threshold: 5,
    }).crossed,
    false,
  );
  const hit = maybeNotifyLowStock({
    productId: "prod-1",
    variantId: null,
    previousStock: 3,
    nextStock: 1,
    threshold: 2,
  });
  assert.equal(hit.shouldNotify, true);
  assert.equal(hit.eventKey, "inventory.low_stock:product:prod-1:t2");
});
