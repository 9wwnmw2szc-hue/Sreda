import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { Kysely, PGliteDialect } from "kysely";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/server/db/migrate.ts";
import { encryptSecret } from "../src/server/connections/crypto.ts";
import { ConnectionService } from "../src/server/connections/service.ts";
import {
  TelegramService,
  webhookSecret,
} from "../src/server/telegram/service.ts";
import { VKService } from "../src/server/vk/service.ts";
import { NAV_ITEMS } from "../src/config/navigation.ts";

const execFileAsync = promisify(execFile);
const secret = "partner-ux-test-secret-value";
const db = new Kysely({ dialect: new PGliteDialect({ pglite: new PGlite() }) });

before(() => migrate(db, new URL("../migrations", import.meta.url).pathname));
after(() => db.destroy());

async function read(rel) {
  return readFile(new URL(rel, import.meta.url), "utf8");
}

async function makeUser(prefix) {
  const id = randomUUID();
  await db
    .insertInto("user")
    .values({
      id,
      name: prefix,
      email: id + "@test.invalid",
      emailVerified: false,
      username: prefix + id.replace(/-/g, "").slice(0, 12),
    })
    .execute();
  return id;
}

async function makeBusiness(ownerId, name) {
  const row = await db
    .insertInto("business")
    .values({
      id: randomUUID(),
      name,
      public_name: name,
      timezone: "Europe/Moscow",
    })
    .returning(["id", "public_id"])
    .executeTakeFirstOrThrow();
  await db
    .insertInto("business_member")
    .values({
      business_id: row.id,
      user_id: ownerId,
      role: "owner",
      status: "active",
    })
    .execute();
  await db
    .insertInto("business_solution")
    .values({
      business_id: row.id,
      solution_code: "orders",
      status: "active",
      starts_at: new Date(),
    })
    .execute();
  return row;
}

function transport() {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    return Response.json({ ok: true, result: true, response: 1 });
  };
  return { calls, fetchImpl };
}

test("telegram start persists running state, stop pauses without disconnect", async () => {
  const owner = await makeUser("own");
  const operator = await makeUser("opr");
  const outsider = await makeUser("out");
  const business = await makeBusiness(owner, "Alpha");
  await db
    .insertInto("business_member")
    .values({
      business_id: business.id,
      user_id: operator,
      role: "operator",
      status: "active",
    })
    .execute();
  const connection = randomUUID();
  await db
    .insertInto("business_connection")
    .values({
      id: connection,
      business_id: business.id,
      platform: "telegram",
      status: "connected",
      external_account_id: "100",
      display_name: "alpha-bot",
    })
    .execute();
  await db
    .insertInto("connection_secret")
    .values({
      connection_id: connection,
      encrypted_token: encryptSecret("123456:telegram-token", secret),
      key_version: 1,
    })
    .execute();
  const { calls, fetchImpl } = transport();
  const telegram = new TelegramService(
    db,
    secret,
    "https://sreda.test",
    true,
    fetchImpl,
  );
  const connections = new ConnectionService(db, secret);
  assert.equal((await telegram.start(owner, business.public_id)).ok, true);
  assert.ok(calls.some((url) => url.includes("setWebhook")));
  const running = await connections.list(owner, business.public_id);
  assert.equal(
    running.find((row) => row.platform === "telegram")?.runtimeStatus,
    "ready",
  );
  const reloaded = await connections.list(owner, business.public_id);
  assert.equal(
    reloaded.find((row) => row.platform === "telegram")?.runtimeStatus,
    "ready",
  );
  await assert.rejects(telegram.stop(operator, business.public_id), (err) => {
    assert.equal(err.status, 403);
    return true;
  });
  await assert.rejects(telegram.stop(outsider, business.public_id), (err) => {
    assert.equal(err.status, 404);
    return true;
  });
  const stopped = await telegram.stop(owner, business.public_id);
  assert.equal(stopped.runtimeStatus, "pending");
  assert.ok(calls.some((url) => url.includes("deleteWebhook")));
  const paused = await connections.list(owner, business.public_id);
  const row = paused.find((item) => item.platform === "telegram");
  assert.equal(row?.runtimeStatus, "pending");
  assert.equal(row?.status, "connected");
  const runtime = await db
    .selectFrom("telegram_runtime")
    .selectAll()
    .where("connection_id", "=", connection)
    .executeTakeFirstOrThrow();
  await assert.rejects(
    telegram.receive(
      connection,
      webhookSecret(secret, connection, runtime.generation),
      { update_id: 1, message: { text: "hi" } },
    ),
    (err) => {
      assert.equal(err.status, 503);
      assert.equal(err.code, "CHANNEL_PAUSED");
      return true;
    },
  );
  await connections.disconnect(owner, business.public_id, "telegram");
  const disconnected = await connections.list(owner, business.public_id);
  assert.equal(
    disconnected.find((item) => item.platform === "telegram")?.status,
    "disconnected",
  );
  const secretRow = await db
    .selectFrom("connection_secret")
    .select("encrypted_token")
    .where("connection_id", "=", connection)
    .executeTakeFirst();
  assert.equal(secretRow, undefined);
});

test("vk stop pauses the callback server without removing the other business", async () => {
  const owner = await makeUser("vko");
  const kept = await makeBusiness(owner, "Keep");
  const business = await makeBusiness(owner, "VK shop");
  const connection = randomUUID();
  await db
    .insertInto("business_connection")
    .values({
      id: connection,
      business_id: business.id,
      platform: "vk",
      status: "connected",
      external_account_id: "55",
      display_name: "vk-group",
    })
    .execute();
  await db
    .insertInto("connection_secret")
    .values({
      connection_id: connection,
      encrypted_token: encryptSecret("vk-token", secret),
      key_version: 1,
    })
    .execute();
  await db
    .insertInto("vk_runtime")
    .values({
      connection_id: connection,
      generation: randomUUID(),
      status: "ready",
      server_id: 9,
    })
    .execute();
  const { calls, fetchImpl } = transport();
  const vk = new VKService(db, secret, true, undefined, fetchImpl);
  const stopped = await vk.stop(owner, business.public_id);
  assert.equal(stopped.runtimeStatus, "pending");
  assert.ok(calls.some((url) => url.includes("groups.deleteCallbackServer")));
  const listed = await new ConnectionService(db, secret).list(
    owner,
    business.public_id,
  );
  assert.equal(listed.find((row) => row.platform === "vk")?.runtimeStatus, "pending");
  assert.equal(listed.find((row) => row.platform === "vk")?.status, "connected");
  const still = await db
    .selectFrom("business")
    .select("id")
    .where("id", "=", kept.id)
    .where("archived_at", "is", null)
    .executeTakeFirst();
  assert.ok(still);
});

test("pagination hides a single page and disclosures expose ARIA", async () => {
  const pagination = await read("../src/components/ui/Pagination.tsx");
  const disclosure = await read("../src/components/ui/Disclosure.tsx");
  const posts = await read("../src/components/posts/PostsView.tsx");
  const messages = await read("../src/components/messages/MessagesView.tsx");
  const bookings = await read("../src/components/booking/BookingsView.tsx");
  assert.match(pagination, /page <= 0 && !hasNext/);
  assert.match(pagination, /return null/);
  assert.match(pagination, /Предыдущая страница/);
  assert.match(pagination, /Следующая страница/);
  assert.doesNotMatch(messages, /Предыдущая\n/);
  assert.match(messages, /<Pagination/);
  assert.match(posts, /<Pagination/);
  assert.match(bookings, /<Pagination/);
  assert.match(disclosure, /aria-expanded=\{open\}/);
  assert.match(disclosure, /aria-controls=\{panelId\}/);
  assert.match(disclosure, /ChevronRight/);
  assert.match(posts, /Текст для площадок/);
  assert.match(posts, /Необязательно/);
  assert.doesNotMatch(posts, /<summary>Текст для площадок/);
  assert.match(bookings, /Настройки записи/);
  assert.match(bookings, /booking-toolbar/);
  assert.match(bookings, /BookingSetupWizard/);
  assert.match(bookings, /booking-date-label__compact/);
});

test("booking setup wizard progress copy is present", async () => {
  const wizard = await read("../src/components/booking/BookingSetupWizard.tsx");
  const chrome = await read("../src/components/ui/SetupChrome.tsx");
  assert.match(wizard, /SetupWizardShell/);
  assert.match(wizard, /Настройка онлайн-записи/);
  assert.match(chrome, /Шаг \{step\} из \{stepCount\}/);
  assert.match(wizard, /Автоматическое расписание/);
});

test("settings sections and sidebar order match the product map", async () => {
  const settings = await read("../src/components/account/SettingsView.tsx");
  const connections = await read("../src/app/(app)/connections/page.tsx");
  const sidebar = await read("../src/components/layout/Sidebar.tsx");
  assert.deepEqual(
    NAV_ITEMS.map((item) => item.label),
    [
      "Главная",
      "Решения",
      "Сообщения",
      "Заказы",
      "Заявки",
      "Запись",
      "Посты",
      "Клиенты",
      "Настройки",
    ],
  );
  assert.equal(NAV_ITEMS.some((item) => item.href === "/connections"), false);
  assert.match(connections, /redirect\("\/settings\?section=connections"\)/);
  assert.match(settings, /Подключения/);
  assert.match(settings, /<ConnectionsView/);
  assert.match(settings, /Сотрудники/);
  assert.match(settings, /Уведомления/);
  assert.match(settings, /Опасная зона/);
  assert.match(settings, /\["solutions", "Решения"\]/);
  assert.match(settings, /\["ai", "AI"\]/);
  assert.match(settings, /Подключение оплаты[\s\S]*следующий\s+шаг/i);
  assert.match(sidebar, /is-locked/);
  assert.match(sidebar, /"\/solutions"/);
});

test("solution icons keep true alpha and no baked plate RGB", async () => {
  const root = new URL("../public/assets/soty/v2/", import.meta.url);
  const files = [
    "module-orders.webp",
    "module-leads.webp",
    "module-booking.webp",
    "module-messages.webp",
    "module-autopost.webp",
  ].map((name) => new URL(name, root).pathname);
  let hasPillow = true;
  try {
    await execFileAsync("python3", ["-c", "from PIL import Image"]);
  } catch {
    hasPillow = false;
  }
  if (!hasPillow) {
    const { stat } = await import("node:fs/promises");
    for (const file of files) {
      const info = await stat(file);
      assert.ok(info.size > 1000, file);
    }
    return;
  }
  const script = `
from PIL import Image
import sys
for path in sys.argv[1:]:
    image = Image.open(path).convert("RGBA")
    w, h = image.size
    if w < 256 or h < 256:
        raise SystemExit(path + " too small for retina " + str((w, h)))
    corner = image.getpixel((0, 0))
    if corner[3] != 0:
        raise SystemExit(path + " corner alpha " + str(corner))
    if any(corner[i] != 0 for i in range(3)):
        raise SystemExit(path + " corner RGB under alpha0 " + str(corner))
    bad = 0
    opaque = 0
    for px in image.getdata():
        r, g, b, a = px
        if a == 0 and (r or g or b):
            bad += 1
        if a > 250:
            opaque += 1
    if bad:
        raise SystemExit(path + " badRGB_on_alpha0=" + str(bad))
    ratio = opaque / (w * h)
    if ratio < 0.12 or ratio > 0.55:
        raise SystemExit(path + " opaque ratio out of range " + str(ratio))
`;
  await execFileAsync("python3", ["-c", script, ...files]);
});
