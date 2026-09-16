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
