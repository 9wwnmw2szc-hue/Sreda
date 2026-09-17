import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Kysely, PGliteDialect } from "kysely";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/server/db/migrate.ts";
import {
  FileAttachmentStorage,
  S3AttachmentStorage,
  attachmentStorage,
  readLimited,
} from "../src/server/attachments/storage.ts";
import {
  AttachmentService,
  validateFile,
} from "../src/server/attachments/service.ts";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5z8AAAAASUVORK5CYII=",
  "base64",
);
const pdf = Buffer.from("%PDF-1.4 minimal");
const mp4 = Buffer.alloc(32);
mp4.write("ftyp", 4);
const ogg = Buffer.from("OggS........");
const db = new Kysely({ dialect: new PGliteDialect({ pglite: new PGlite() }) });
const secret = "attachment-fixture-".repeat(4);
before(() => migrate(db, new URL("../migrations", import.meta.url).pathname));
after(() => db.destroy());
async function businessFixture() {
  const uid = randomUUID();
  await db
    .insertInto("user")
    .values({
      id: uid,
      name: "Owner",
      email: uid + "@test.invalid",
      emailVerified: false,
      username: "u" + uid,
    })
    .execute();
  const b = await db
    .insertInto("business")
    .values({
      id: randomUUID(),
      name: "Attachments",
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
  return { uid, b };
}
test("attachment content validation rejects disguised files and enforces stream size", async () => {
  validateFile(png, "image/png", "image");
  assert.throws(
    () =>
      validateFile(Buffer.from("<script>bad</script>"), "image/png", "image"),
    (e) => e.code === "INVALID_ATTACHMENT",
  );
  assert.throws(
    () => validateFile(png, "image/png", "voice"),
    (e) => e.code === "INVALID_ATTACHMENT",
  );
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(new Uint8Array(20));
      c.close();
    },
  });
  await assert.rejects(
    readLimited(stream.getReader(), 10),
    (e) => e.code === "FILE_TOO_LARGE",
  );
});
test("storage keyCheck accepts canonical UUID/UUID and rejects unsafe keys", async () => {
  const root = await mkdtemp(join(tmpdir(), "sreda-key-"));
  try {
    const s = new FileAttachmentStorage(root);
    const businessId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const attachmentId = "11111111-2222-3333-4444-555555555555";
    const valid = `${businessId}/${attachmentId}`;
    await s.put(valid, png, "image/png");
    assert.deepEqual(await s.get(valid), png);
    await s.remove(valid);

    const reject = (key) => assert.rejects(() => s.get(key), /Invalid storage key/);
    await reject("not-a-uuid/" + attachmentId);
    await reject(businessId + "/not-a-uuid");
    await reject("../" + attachmentId);
    await reject(businessId + "/../" + attachmentId);
    await reject("/" + valid);
    await reject(businessId + "/" + attachmentId + "/extra");
    await reject(businessId + "\\" + attachmentId);
    await reject("%2e%2e/" + attachmentId);
    await reject(businessId + "/%2e%2e%2f" + attachmentId);
    await reject("AAAAAAaa-bbbb-cccc-dddd-eeeeeeeeeeee/" + attachmentId);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("filesystem storage round-trips bytes and rejects traversal and overwrite", async () => {
  const root = await mkdtemp(join(tmpdir(), "sreda-media-"));
  try {
    const s = new FileAttachmentStorage(root),
      key = randomUUID() + "/" + randomUUID();
    await s.put(key, png, "image/png");
    assert.deepEqual(await s.get(key), png);
    await assert.rejects(s.put(key, png, "image/png"));
    await assert.rejects(s.get("../secret"));
    await s.remove(key);
    await assert.rejects(s.get(key));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("S3 adapter uses private object operations without exposing a public URL", async () => {
  const commands = [];
  const fake = {
    async send(command) {
      commands.push(command);
      return {
        ContentLength: png.length,
        Body: {
          transformToWebStream: () =>
            new ReadableStream({
              start(c) {
                c.enqueue(png);
                c.close();
              },
            }),
        },
      };
    },
  };
  const s = new S3AttachmentStorage(fake, "private-bucket"),
    key = randomUUID() + "/" + randomUUID();
  await s.put(key, png, "image/png");
  assert.deepEqual(await s.get(key), png);
  await s.remove(key);
  assert.deepEqual(
    commands.map((c) => c.constructor.name),
    ["PutObjectCommand", "GetObjectCommand", "DeleteObjectCommand"],
  );
  assert.ok(
    commands.every(
      (c) =>
        c.input.Bucket === "private-bucket" &&
        c.input.Key === key &&
        !c.input.ACL,
    ),
  );
});

test("AttachmentService upload/save then load round-trips storage provider types", async () => {
  const root = await mkdtemp(join(tmpdir(), "sreda-svc-"));
  const oldMode = process.env.ATTACHMENT_STORAGE,
    oldRoot = process.env.ATTACHMENT_STORAGE_PATH;
  process.env.ATTACHMENT_STORAGE = "filesystem";
  process.env.ATTACHMENT_STORAGE_PATH = root;
  try {
    const { uid, b } = await businessFixture();
    const store = new FileAttachmentStorage(root);
    const svc = new AttachmentService(db, secret, store);
    const samples = [
      ["image.png", "image/png", "image", png],
      ["note.pdf", "application/pdf", "document", pdf],
      ["clip.mp4", "video/mp4", "video", mp4],
      ["voice.ogg", "audio/ogg", "voice", ogg],
    ];
    for (const [filename, mime, type, bytes] of samples) {
      const saved = await svc.upload(uid, b.public_id, filename, mime, type, bytes);
      const loaded = await svc.load(b.id, saved.id);
      assert.equal(loaded.type, type);
      assert.equal(loaded.mime, mime);
      assert.deepEqual(Buffer.from(loaded.bytes), bytes);
      assert.match(loaded.filename, new RegExp(filename.replace(".", "\\.")));
    }
  } finally {
    if (oldMode === undefined) delete process.env.ATTACHMENT_STORAGE;
    else process.env.ATTACHMENT_STORAGE = oldMode;
    if (oldRoot === undefined) delete process.env.ATTACHMENT_STORAGE_PATH;
    else process.env.ATTACHMENT_STORAGE_PATH = oldRoot;
    await rm(root, { recursive: true, force: true });
  }
});

test("storage configuration fails closed for incomplete or unsafe modes", () => {
  const keys = [
    "ATTACHMENT_STORAGE",
    "ATTACHMENT_STORAGE_PATH",
    "S3_ENDPOINT",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    process.env.ATTACHMENT_STORAGE = "filesystem";
    delete process.env.ATTACHMENT_STORAGE_PATH;
    assert.throws(
      () => attachmentStorage(),
      (error) => error.code === "STORAGE_NOT_CONFIGURED",
    );
    process.env.ATTACHMENT_STORAGE = "public-url";
    assert.throws(
      () => attachmentStorage(),
      (error) => error.code === "STORAGE_NOT_CONFIGURED",
    );
    process.env.ATTACHMENT_STORAGE = "s3";
    process.env.S3_ENDPOINT = "https://user:password@s3.example.invalid";
    process.env.S3_BUCKET = "private";
    process.env.S3_ACCESS_KEY_ID = "key";
    process.env.S3_SECRET_ACCESS_KEY = "secret";
    assert.throws(
      () => attachmentStorage(),
      (error) => error.code === "STORAGE_NOT_CONFIGURED",
    );
  } finally {
    for (const key of keys)
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
  }
});
