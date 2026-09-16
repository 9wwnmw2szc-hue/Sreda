import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Kysely, PGliteDialect } from "kysely";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/server/db/migrate.ts";
import { PostService } from "../src/server/posts/service.ts";
import {
  queueScheduledPost,
  materializeRecurringPost,
} from "../src/server/posts/worker.ts";
import { TelegramService } from "../src/server/telegram/service.ts";
import { VKService } from "../src/server/vk/service.ts";
import { encryptSecret } from "../src/server/connections/crypto.ts";
const db = new Kysely({ dialect: new PGliteDialect({ pglite: new PGlite() }) });
const secret = "fixture-secret-".repeat(4);
before(() => migrate(db, new URL("../migrations", import.meta.url).pathname));
after(() => db.destroy());
async function fixture() {
  const uid = randomUUID();
  await db
    .insertInto("user")
    .values({
      id: uid,
      name: "Admin",
      email: uid + "@test.invalid",
      emailVerified: false,
      username: "u" + uid,
    })
    .execute();
  const b = await db
    .insertInto("business")
    .values({
      id: randomUUID(),
      name: "Posts business",
      timezone: "Europe/Kaliningrad",
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  await db
    .insertInto("business_member")
    .values({
      business_id: b.id,
      user_id: uid,
      role: "owner",
      status: "active",
    })
    .execute();
  await db
    .insertInto("business_solution")
    .values({
      business_id: b.id,
      solution_code: "autopost",
      status: "active",
      starts_at: new Date(),
      expires_at: null,
    })
    .execute();
  const targets = [];
  for (const platform of ["telegram", "vk"]) {
    const connection_id = randomUUID();
    await db
      .insertInto("business_connection")
      .values({
        id: connection_id,
        business_id: b.id,
        platform,
        external_account_id: randomUUID(),
        display_name: "fixture",
        status: "connected",
      })
      .execute();
    await db
      .insertInto("connection_secret")
      .values({
        connection_id,
        encrypted_token: encryptSecret("fixture-token", secret),
        encrypted_publish_token: encryptSecret("fixture-user-token", secret),
        key_version: 1,
      })
      .execute();
    await db
      .insertInto(platform + "_runtime")
      .values({ connection_id, generation: randomUUID(), status: "ready" })
      .execute();
    const target = {
      id: randomUUID(),
      business_id: b.id,
      connection_id,
      platform,
      external_id: platform === "telegram" ? "-100123" : "-123",
      title: platform,
    };
    await db.insertInto("post_target").values(target).execute();
    targets.push(target.id);
  }
  return { uid, b, targets, svc: new PostService(db, secret) };
}
test("scheduled post reaches both outboxes; partial failure retries only failed platform", async () => {
  const f = await fixture();
  const body = {
    text: "Новая услуга",
    targets: f.targets,
    action: "now",
    request_key: randomUUID(),
  };
  const p = await f.svc.save(f.uid, f.b.public_id, body);
  assert.equal((await f.svc.save(f.uid, f.b.public_id, body)).id, p.id);
  await queueScheduledPost(db);
  let tgCalls = 0;
  const tg = new TelegramService(
    db,
    secret,
    "https://fixture.test",
    true,
    async () => {
      tgCalls++;
      return Response.json({ ok: true, result: { message_id: 555 } });
    },
  );
  const vkFail = new VKService(db, secret, true, undefined, async () =>
    Response.json({ error: { error_code: 15 } }),
  );
  await tg.deliverOne();
  await vkFail.deliverOne();
  let posts = await f.svc.list(f.uid, f.b.public_id);
  assert.equal(posts[0].status, "partial");
  await f.svc.action(f.uid, f.b.public_id, p.id, "retry");
  await queueScheduledPost(db);
  const vk = new VKService(db, secret, true, undefined, async (url, init) => {
    const params = new URLSearchParams(init.body);
    assert.equal(url.split("/").at(-1), "wall.post");
    assert.ok(params.get("guid"));
    return Response.json({ response: { post_id: 777 } });
  });
  await vk.deliverOne();
  await tg.deliverOne();
  posts = await f.svc.list(f.uid, f.b.public_id);
  assert.equal(posts[0].status, "published");
  assert.equal(tgCalls, 1);
  assert.ok(posts[0].deliveries.every((d) => d.external_message_id));
});
test("recurring job is materialized once and cancelling leaves published history", async () => {
  const f = await fixture();
  const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const template = await f.svc.save(f.uid, f.b.public_id, {
    text: "Повтор",
    targets: f.targets,
    action: "schedule",
    request_key: randomUUID(),
    recurrence: { frequency: "daily", start: date, time: "10:00" },
  });
  await db
    .updateTable("post_schedule")
    .set({ next_at: new Date(Date.now() - 1000) })
    .where("post_id", "=", template.id)
    .execute();
  await materializeRecurringPost(db);
  await materializeRecurringPost(db);
  const occurrences = await db
    .selectFrom("post")
    .selectAll()
    .where("template_id", "=", template.id)
    .execute();
  assert.equal(occurrences.length, 1);
  await db
    .updateTable("post")
    .set({ status: "published" })
    .where("id", "=", occurrences[0].id)
    .execute();
  await f.svc.action(f.uid, f.b.public_id, template.id, "cancel");
  assert.equal(
    (
      await db
        .selectFrom("post")
        .select("status")
        .where("id", "=", occurrences[0].id)
        .executeTakeFirstOrThrow()
    ).status,
    "published",
  );
});
test("temporary platform error uses bounded retry delay and unknown delivery cannot be retried", async () => {
  const f = await fixture();
  const p = await f.svc.save(f.uid, f.b.public_id, {
    text: "Retry",
    targets: [f.targets[0]],
    action: "now",
    request_key: randomUUID(),
  });
  await queueScheduledPost(db);
  const worker = new TelegramService(
    db,
    secret,
    "https://fixture.test",
    true,
    async () => Response.json({ ok: false }, { status: 429 }),
  );
  await worker.deliverOne();
  const delivery = await db
    .selectFrom("post_delivery")
    .select("id")
    .where("post_id", "=", p.id)
    .executeTakeFirstOrThrow();
  const row = await db
    .selectFrom("telegram_outbox")
    .selectAll()
    .where("post_delivery_id", "=", delivery.id)
    .executeTakeFirstOrThrow();
  assert.ok(+row.available_at - Date.now() > 50000);
  assert.equal(row.delivery_state, "pending");
  await db
    .updateTable("telegram_outbox")
    .set({ available_at: new Date(0) })
    .where("id", "=", row.id)
    .execute();
  const uncertain = new TelegramService(
    db,
    secret,
    "https://fixture.test",
    true,
    async () => {
      throw Error("timeout");
    },
  );
  await uncertain.deliverOne();
  await assert.rejects(
    f.svc.action(f.uid, f.b.public_id, p.id, "retry"),
    (e) => e.code === "DELIVERY_UNCERTAIN",
  );
});
test("media albums keep ordered steps, copy attachments and reject cross-business files", async () => {
  const f = await fixture();
  const ids = [randomUUID(), randomUUID()];
  for (const id of ids)
    await db
      .insertInto("attachment")
      .values({
        id,
        business_id: f.b.id,
        type: "image",
        provider: "storage",
        storage_key: f.b.id + "/" + id,
        connection_id: null,
        external: "{}",
        filename: "photo.png",
        mime_type: "image/png",
        size_bytes: "68",
      })
      .execute();
  const body = {
    text: "А".repeat(1100),
    attachments: ids,
    targets: [f.targets[0]],
    action: "now",
    request_key: randomUUID(),
  };
  const p = await f.svc.save(f.uid, f.b.public_id, body);
  await queueScheduledPost(db);
  const delivery = await db
    .selectFrom("post_delivery")
    .select("id")
    .where("post_id", "=", p.id)
    .executeTakeFirstOrThrow();
  const jobs = await db
    .selectFrom("telegram_outbox")
    .selectAll()
    .where("post_delivery_id", "=", delivery.id)
    .orderBy("post_step")
    .execute();
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].message.length, 1100);
  assert.deepEqual(jobs[0].attachment_ids, []);
  assert.deepEqual(jobs[1].attachment_ids, ids);
  await queueScheduledPost(db);
  assert.equal(
    (
      await db
        .selectFrom("telegram_outbox")
        .select("id")
        .where("post_delivery_id", "=", delivery.id)
        .execute()
    ).length,
    2,
  );
  const copy = await f.svc.action(f.uid, f.b.public_id, p.id, "duplicate");
  assert.equal(
    (
      await db
        .selectFrom("post_attachment")
        .select("attachment_id")
        .where("post_id", "=", copy.id)
        .execute()
    ).length,
    2,
  );
  const other = await fixture();
  await assert.rejects(
    other.svc.save(other.uid, other.b.public_id, {
      ...body,
      targets: other.targets,
      request_key: randomUUID(),
    }),
    (e) => e.code === "INVALID_POST",
  );
  await assert.rejects(
    f.svc.save(f.uid, f.b.public_id, { ...body, attachments: [ids[0]] }),
    (e) => e.code === "REQUEST_CONFLICT",
  );
});
test("Telegram multipart media uploads actual bytes and requires delivery identifiers", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { AttachmentService } = await import(
    "../src/server/attachments/service.ts"
  );
  const { FileAttachmentStorage } = await import(
    "../src/server/attachments/storage.ts"
  );
  const { sendTelegramMedia } = await import(
    "../src/server/attachments/send.ts"
  );
  const f = await fixture();
  const root = await mkdtemp(join(tmpdir(), "sreda-post-media-"));
  const oldMode = process.env.ATTACHMENT_STORAGE,
    oldRoot = process.env.ATTACHMENT_STORAGE_PATH;
  process.env.ATTACHMENT_STORAGE = "filesystem";
  process.env.ATTACHMENT_STORAGE_PATH = root;
  try {
    const store = new FileAttachmentStorage(root),
      svc = new AttachmentService(db, secret, store);
    const bytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5z8AAAAASUVORK5CYII=",
      "base64",
    );
    const one = await svc.upload(
      f.uid,
      f.b.public_id,
      "one.png",
      "image/png",
      "image",
      bytes,
    );
    const two = await svc.upload(
      f.uid,
      f.b.public_id,
      "two.png",
      "image/png",
      "image",
      bytes,
    );
    const sent = await sendTelegramMedia(
      db,
      secret,
      f.b.id,
      "test-token",
      "-100",
      "Фото",
      [one.id, two.id],
      {},
      async (url, init) => {
        assert.ok(url.endsWith("/sendMediaGroup"));
        assert.ok(init.body instanceof FormData);
        assert.equal(JSON.parse(init.body.get("media")).length, 2);
        assert.deepEqual(
          Buffer.from(await init.body.get("file0").arrayBuffer()),
          bytes,
        );
        return Response.json({
          ok: true,
          result: [{ message_id: 1 }, { message_id: 2 }],
        });
      },
    );
    assert.equal(sent.message_id, "1,2");
    await assert.rejects(
      sendTelegramMedia(
        db,
        secret,
        f.b.id,
        "test-token",
        "-100",
        "Фото",
        [one.id],
        {},
        async () => Response.json({ ok: true, result: {} }),
      ),
      (e) => e.uncertain === true,
    );
  } finally {
    if (oldMode === undefined) delete process.env.ATTACHMENT_STORAGE;
    else process.env.ATTACHMENT_STORAGE = oldMode;
    if (oldRoot === undefined) delete process.env.ATTACHMENT_STORAGE_PATH;
    else process.env.ATTACHMENT_STORAGE_PATH = oldRoot;
    await rm(root, { recursive: true, force: true });
  }
});
test("deleting a draft hides it while retaining audit and forbids later publication", async () => {
  const f = await fixture();
  const p = await f.svc.save(f.uid, f.b.public_id, {
    text: "Черновик для удаления",
    targets: f.targets,
    action: "draft",
    request_key: randomUUID(),
  });
  await f.svc.action(f.uid, f.b.public_id, p.id, "delete");
  assert.equal(
    (await f.svc.list(f.uid, f.b.public_id)).some((x) => x.id === p.id),
    false,
  );
  const stored = await db
    .selectFrom("post")
    .selectAll()
    .where("id", "=", p.id)
    .executeTakeFirstOrThrow();
  assert.ok(stored.deleted_at);
  assert.equal(stored.status, "cancelled");
  await assert.rejects(
    f.svc.action(f.uid, f.b.public_id, p.id, "now"),
    (e) => e.code === "POST_NOT_FOUND",
  );
  assert.ok(
    await db
      .selectFrom("business_audit_log")
      .select("id")
      .where("business_id", "=", f.b.id)
      .where("action", "=", "post_cancelled")
      .executeTakeFirst(),
  );
});

test("post filters apply before pagination and keep older drafts reachable", async () => {
  const f = await fixture();
  await db
    .insertInto("post")
    .values(
      Array.from({ length: 103 }, (_, i) => ({
        id: randomUUID(),
        business_id: f.b.id,
        created_by: f.uid,
        text: "Draft " + i,
        request_key: randomUUID(),
        request_hash: "fixture",
        status: "draft",
        buttons: JSON.stringify([]),
        scheduled_at: null,
      })),
    )
    .execute();
  const first = await f.svc.list(f.uid, f.b.public_id, 0, "draft");
  const second = await f.svc.list(f.uid, f.b.public_id, 1, "draft");
  assert.equal(first.length, 100);
  assert.equal(second.length, 3);
  assert.equal(new Set([...first, ...second].map((p) => p.id)).size, 103);
  assert.deepEqual(await f.svc.list(f.uid, f.b.public_id, 0, "published"), []);
  await assert.rejects(
    f.svc.list(f.uid, f.b.public_id, -1),
    (e) => e.code === "INVALID_POST",
  );
});
