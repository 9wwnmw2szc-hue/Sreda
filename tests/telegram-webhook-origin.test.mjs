import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { Kysely, PGliteDialect } from "kysely";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/server/db/migrate.ts";
import { encryptSecret } from "../src/server/connections/crypto.ts";
import { TelegramService } from "../src/server/telegram/service.ts";
import { runtimeConfig } from "../src/server/identity/config.ts";
import { stagingConfiguration } from "../src/server/readiness/config.ts";

const secret = "telegram-webhook-origin-secret-value";
const db = new Kysely({ dialect: new PGliteDialect({ pglite: new PGlite() }) });

before(() => migrate(db, new URL("../migrations", import.meta.url).pathname));
after(() => db.destroy());

function transport() {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
    return Response.json({ ok: true, result: true });
  };
  return { calls, fetchImpl };
}

async function seedBusiness() {
  const userId = randomUUID();
  await db
    .insertInto("user")
    .values({
      id: userId,
      name: "own",
      email: userId + "@test.invalid",
      emailVerified: false,
      username: "own" + userId.replace(/-/g, "").slice(0, 12),
    })
    .execute();
  const business = await db
    .insertInto("business")
    .values({
      id: randomUUID(),
      name: "Relay",
      public_name: "Relay",
      timezone: "Europe/Moscow",
    })
    .returning(["id", "public_id"])
    .executeTakeFirstOrThrow();
  await db
    .insertInto("business_member")
    .values({
      business_id: business.id,
      user_id: userId,
      role: "owner",
      status: "active",
    })
    .execute();
  await db
    .insertInto("business_solution")
    .values({
      business_id: business.id,
      solution_code: "admin_messages",
      status: "active",
      starts_at: new Date(),
    })
    .execute();
  const connectionId = randomUUID();
  await db
    .insertInto("business_connection")
    .values({
      id: connectionId,
      business_id: business.id,
      platform: "telegram",
      status: "connected",
      external_account_id: "100",
      display_name: "relay-bot",
    })
    .execute();
  await db
    .insertInto("connection_secret")
    .values({
      connection_id: connectionId,
      encrypted_token: encryptSecret("123456:telegram-token", secret),
      key_version: 1,
    })
    .execute();
  return { userId, business, connectionId };
}

test("telegram start publishes the webhook on the configured relay base URL", async () => {
  const { userId, business, connectionId } = await seedBusiness();
  const { calls, fetchImpl } = transport();
  const telegram = new TelegramService(
    db,
    secret,
    "https://tg.example.invalid",
    true,
    fetchImpl,
  );
  assert.deepEqual(await telegram.start(userId, business.public_id), {
    ok: true,
  });
  const setWebhook = calls.find((call) => call.url.includes("setWebhook"));
  assert.ok(setWebhook, "setWebhook must be called");
  assert.equal(
    setWebhook.body.url,
    "https://tg.example.invalid/api/telegram/" + connectionId,
  );
  assert.equal(setWebhook.body.max_connections, 1);
  assert.deepEqual(setWebhook.body.allowed_updates, ["message"]);
  assert.match(setWebhook.body.secret_token, /^[a-f0-9]{64}$/);
});

test("runtimeConfig keeps APP_URL as the default webhook origin", () => {
  const env = {
    APP_URL: "https://biznesoty.ru",
    BETTER_AUTH_SECRET: secret,
    DATABASE_URL: "postgresql://user:password@db.invalid/app",
    NODE_ENV: "production",
  };
  process.env.APP_URL = env.APP_URL;
  process.env.BETTER_AUTH_SECRET = env.BETTER_AUTH_SECRET;
  process.env.DATABASE_URL = env.DATABASE_URL;
  process.env.NODE_ENV = env.NODE_ENV;
  delete process.env.TELEGRAM_WEBHOOK_BASE_URL;
  assert.deepEqual(runtimeConfig(), {
    origin: "https://biznesoty.ru",
    telegramWebhookOrigin: "https://biznesoty.ru",
    secret,
    databaseUrl: env.DATABASE_URL,
  });
  process.env.TELEGRAM_WEBHOOK_BASE_URL = "https://tg.example.invalid";
  assert.equal(
    runtimeConfig().telegramWebhookOrigin,
    "https://tg.example.invalid",
  );
  process.env.TELEGRAM_WEBHOOK_BASE_URL = "   ";
  assert.equal(
    runtimeConfig().telegramWebhookOrigin,
    "https://biznesoty.ru",
  );
  for (const invalid of [
    "https://tg.example.invalid/",
    "https://tg.example.invalid/hook",
    "http://tg.example.invalid",
    "https://user:pass@tg.example.invalid",
  ]) {
    process.env.TELEGRAM_WEBHOOK_BASE_URL = invalid;
    assert.throws(
      () => runtimeConfig(),
      /Invalid Telegram webhook base URL/,
      invalid,
    );
  }
  delete process.env.TELEGRAM_WEBHOOK_BASE_URL;
});

test("staging diagnostics validate the relay base URL only when it is set", () => {
  const env = { APP_URL: "https://biznesoty.ru" };
  assert.equal(
    stagingConfiguration(env).some(
      (check) => check.name === "TELEGRAM_WEBHOOK_BASE_URL",
    ),
    false,
  );
  const valid = stagingConfiguration({
    ...env,
    TELEGRAM_WEBHOOK_BASE_URL: "https://tg.example.invalid",
  }).find((check) => check.name === "TELEGRAM_WEBHOOK_BASE_URL");
  assert.equal(valid.ok, true);
  for (const invalid of [
    "http://tg.example.invalid",
    "https://tg.example.invalid/hook",
    "not-a-url",
  ])
    assert.equal(
      stagingConfiguration({
        ...env,
        TELEGRAM_WEBHOOK_BASE_URL: invalid,
      }).find((check) => check.name === "TELEGRAM_WEBHOOK_BASE_URL").ok,
      false,
      invalid,
    );
});
