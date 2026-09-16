import { test } from "node:test";
import assert from "node:assert/strict";
import { nextOccurrence } from "../src/server/posts/recurrence.ts";
import { generatePost } from "../src/server/ai/posts.ts";
test("recurrence respects timezone, skips missing DST time and invalid month days", () => {
  assert.equal(
    nextOccurrence(
      {
        frequency: "daily",
        start: "2026-03-28",
        time: "02:30",
        timezone: "Europe/Berlin",
      },
      new Date("2026-03-28T03:00Z"),
    ).toISOString(),
    "2026-03-30T00:30:00.000Z",
  );
  assert.equal(
    nextOccurrence(
      {
        frequency: "monthly",
        start: "2026-01-31",
        time: "10:00",
        timezone: "Asia/Kathmandu",
      },
      new Date("2026-02-01T00:00Z"),
    ).toISOString(),
    "2026-03-31T04:15:00.000Z",
  );
  assert.equal(
    nextOccurrence(
      {
        frequency: "daily",
        start: "2026-01-01",
        end: "2026-01-02",
        time: "10:00",
        timezone: "UTC",
      },
      new Date("2026-01-03T00:00Z"),
    ),
    null,
  );
});
test("AI sends only requested content, always produces a draft and rejects secrets", async () => {
  let body;
  const result = await generatePost(
    {
      prompt: "Пост о новой услуге",
      client_data: "DO NOT SEND",
      action: "generate",
    },
    {
      token: "fixture-key",
      model: "configured-model",
      transport: async (url, init) => {
        body = JSON.parse(init.body);
        assert.equal(url, "https://api.openai.com/v1/responses");
        return Response.json({
          status: "completed",
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: "Наш новый сервис" }],
            },
          ],
        });
      },
    },
  );
  assert.equal(result.status, "draft");
  assert.equal(body.store, false);
  assert.ok(!JSON.stringify(body).includes("DO NOT SEND"));
  await assert.rejects(
    generatePost({ prompt: "123456789:abcdefghijklmnopqrstuvwxyz12345" }),
    (e) => e.code === "AI_SECRET_REJECTED",
  );
  await assert.rejects(
    generatePost(
      { prompt: "Напиши пост" },
      {
        token: "x",
        model: "x",
        transport: async () => Response.json({ status: "incomplete" }),
      },
    ),
    (e) => e.code === "AI_UNAVAILABLE",
  );
});

test("staging diagnostics expose missing names, never secret values, and require real HTTPS config", async () => {
  const { stagingConfiguration } = await import(
    "../src/server/readiness/config.ts"
  );
  const secret = "test-secret-value-not-for-production";
  const env = {
    APP_URL: "https://staging.example.invalid",
    DATABASE_URL: "postgresql://user:password@db.invalid/staging",
    BETTER_AUTH_SECRET: secret,
    NEXT_PUBLIC_DATA_SOURCE: "api",
    TELEGRAM_WEBHOOKS_ENABLED: "true",
    VK_WEBHOOKS_ENABLED: "true",
    ATTACHMENT_STORAGE: "s3",
    S3_ENDPOINT: "https://s3.example.invalid",
    S3_REGION: "test",
    S3_BUCKET: "private",
    S3_ACCESS_KEY_ID: secret,
    S3_SECRET_ACCESS_KEY: secret,
    AI_API_TOKEN: secret,
    AI_MODEL: "test-model",
  };
  const checks = stagingConfiguration(env);
  assert.ok(checks.every((c) => c.ok));
  assert.ok(!JSON.stringify(checks).includes(secret));
  for (const key of Object.keys(env)) {
    assert.equal(
      stagingConfiguration({ ...env, [key]: undefined }).find(
        (c) => c.name === key,
      ).ok,
      false,
      key,
    );
  }
  assert.equal(
    stagingConfiguration({
      ...env,
      APP_URL: "http://staging.example.invalid",
    }).find((c) => c.name === "APP_URL").ok,
    false,
  );
  assert.equal(
    stagingConfiguration({ ...env, S3_ENDPOINT: "not-a-url" }).find(
      (c) => c.name === "S3_ENDPOINT",
    ).ok,
    false,
  );
});
