import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Kysely, PGliteDialect } from "kysely";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/server/db/migrate.ts";
import { SolutionService } from "../src/server/solutions/service.ts";
import {
  getAvailableCustomerActions,
  assertCustomerActionAvailable,
} from "../src/server/solutions/customer-actions.ts";
import { notify } from "../src/server/notifications/service.ts";
import { NotificationService } from "../src/server/notifications/service.ts";
import { queueBookingReminder } from "../src/server/booking/worker.ts";

const db = new Kysely({ dialect: new PGliteDialect({ pglite: new PGlite() }) });
before(() => migrate(db, new URL("../migrations", import.meta.url).pathname));
after(() => db.destroy());

async function createUser(name = "Owner", role = "owner") {
  const id = randomUUID();
  const row = await db
    .insertInto("user")
    .values({
      id,
      name,
      email: id + "@test.invalid",
      emailVerified: false,
      username: "u" + id.slice(0, 8),
    })
    .returning(["id", "public_id", "name"])
    .executeTakeFirstOrThrow();
  return { ...row, role };
}

async function fixture(ownerName = "Owner") {
  const owner = await createUser(ownerName);
  const business = await db
    .insertInto("business")
    .values({
      id: randomUUID(),
      name: "Бизнес " + ownerName,
      timezone: "Europe/Moscow",
      business_type: "hybrid",
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  await db
    .insertInto("business_member")
    .values({
      business_id: business.id,
      user_id: owner.id,
      role: "owner",
      status: "active",
    })
    .execute();
  return {
    owner,
    business,
    solutions: new SolutionService(db),
    notifications: new NotificationService(db),
  };
}

async function addProduct(businessId, name = "Товар") {
  const id = randomUUID();
  await db
    .insertInto("product")
    .values({
      id,
      business_id: businessId,
      name,
      price: "100.00",
      currency: "RUB",
      active: true,
      position: 0,
      use_variants: false,
      track_inventory: false,
      availability: "in_stock",
    })
    .execute();
  return id;
}

test("1. activate → active lifecycle", async () => {
  const f = await fixture();
  await f.solutions.activate(f.owner.id, f.business.public_id, {
    code: "admin_messages",
    enabled: true,
  });
  // Without channels → setup_in_progress
  let row = (await f.solutions.list(f.owner.id, f.business.public_id)).find(
    (i) => i.solutionId === "sol_admin_messages",
  );
  assert.equal(row?.lifecycleStatus, "setup_in_progress");
  assert.equal(row?.status, "setup_required");

  await f.solutions.activate(f.owner.id, f.business.public_id, {
    code: "orders",
    enabled: true,
  });
  await addProduct(f.business.id);
  row = (await f.solutions.list(f.owner.id, f.business.public_id)).find(
    (i) => i.solutionId === "sol_orders",
  );
  // Products present; channel readiness may yield active or error/paused legacy
  assert.ok(
    row?.lifecycleStatus === "active" || row?.lifecycleStatus === "error",
  );
  assert.equal(row?.entitlementStatus, "active");
});

test("2. touch draft → setup_in_progress; cancel_setup → disabled; orders products untouched", async () => {
  const f = await fixture();
  await f.solutions.activate(f.owner.id, f.business.public_id, {
    code: "orders",
    enabled: true,
  });
  const productId = await addProduct(f.business.id, "Кофе");
  await f.solutions.touchSetupDraft(f.business.id, "orders", { step: 1 });
  const mid = (await f.solutions.list(f.owner.id, f.business.public_id)).find(
    (i) => i.solutionId === "sol_orders",
  );
  assert.equal(mid?.lifecycleStatus, "setup_in_progress");
  assert.ok(mid?.setupDraft);
  assert.equal(mid?.setupDraft?.status, "in_progress");

  await f.solutions.cancelSetup(f.owner.id, f.business.public_id, "orders");
  const after = (await f.solutions.list(f.owner.id, f.business.public_id)).find(
    (i) => i.solutionId === "sol_orders",
  );
  assert.equal(after?.lifecycleStatus, "disabled");
  assert.equal(after?.status, "available");
  assert.equal(after?.entitlementStatus, "disabled");

  const draft = await db
    .selectFrom("solution_setup_draft")
    .select(["status", "draft"])
    .where("business_id", "=", f.business.id)
    .where("solution_code", "=", "orders")
    .executeTakeFirstOrThrow();
  assert.equal(draft.status, "cancelled");
  assert.deepEqual(draft.draft, {});

  const product = await db
    .selectFrom("product")
    .select(["id", "active"])
    .where("id", "=", productId)
    .executeTakeFirst();
  assert.ok(product);
  assert.equal(product.active, true);

  const audits = await db
    .selectFrom("business_audit_log")
    .select("action")
    .where("business_id", "=", f.business.id)
    .where("action", "=", "solution.setup_cancelled")
    .execute();
  assert.equal(audits.length, 1);
});

test("3. disable → getAvailableCustomerActions omits code", async () => {
  const f = await fixture();
  await f.solutions.activate(f.owner.id, f.business.public_id, {
    code: "orders",
    enabled: true,
  });
  await addProduct(f.business.id);
  let actions = await getAvailableCustomerActions(db, f.business.id, "telegram");
  assert.equal(actions.has("orders"), true);

  await f.solutions.activate(f.owner.id, f.business.public_id, {
    code: "orders",
    enabled: false,
  });
  actions = await getAvailableCustomerActions(db, f.business.id, "telegram");
  assert.equal(actions.has("orders"), false);
  assert.equal(
    await assertCustomerActionAvailable(
      db,
      f.business.id,
      "telegram",
      "orders",
    ),
    false,
  );
});

test("4. disable → list lifecycleStatus disabled", async () => {
  const f = await fixture();
  await f.solutions.activate(f.owner.id, f.business.public_id, {
    code: "booking",
    enabled: true,
  });
  await f.solutions.activate(f.owner.id, f.business.public_id, {
    code: "booking",
    enabled: false,
  });
  const row = (await f.solutions.list(f.owner.id, f.business.public_id)).find(
    (i) => i.solutionId === "sol_booking",
  );
  assert.equal(row?.lifecycleStatus, "disabled");
  assert.equal(row?.entitlementStatus, "disabled");
  assert.equal(row?.status, "available");
});

test("5–6. disable preserves products; reenable still has products", async () => {
  const f = await fixture();
  await f.solutions.activate(f.owner.id, f.business.public_id, {
    code: "orders",
    enabled: true,
  });
  const productId = await addProduct(f.business.id, "Чай");
  await f.solutions.activate(f.owner.id, f.business.public_id, {
    code: "orders",
    enabled: false,
  });
  assert.ok(
    await db
      .selectFrom("product")
      .select("id")
      .where("id", "=", productId)
      .executeTakeFirst(),
  );
  await f.solutions.activate(f.owner.id, f.business.public_id, {
    code: "orders",
    enabled: true,
  });
  const product = await db
    .selectFrom("product")
    .select(["id", "active", "name"])
    .where("id", "=", productId)
    .executeTakeFirstOrThrow();
  assert.equal(product.active, true);
  assert.equal(product.name, "Чай");
  const audits = await db
    .selectFrom("business_audit_log")
    .select("action")
    .where("business_id", "=", f.business.id)
    .where("action", "=", "solution.reenabled")
    .execute();
  assert.equal(audits.length, 1);
});

test("7. reset_settings booking → services inactive; bookings remain", async () => {
  const f = await fixture();
  await f.solutions.activate(f.owner.id, f.business.public_id, {
    code: "booking",
    enabled: true,
  });
  const serviceId = randomUUID();
  const specialistId = randomUUID();
  const clientId = randomUUID();
  await db
    .insertInto("booking_service")
    .values({
      id: serviceId,
      business_id: f.business.id,
      name: "Стрижка",
      duration_minutes: 30,
      price: "500.00",
      currency: "RUB",
      active: true,
    })
    .execute();
  await db
    .insertInto("booking_specialist")
    .values({
      id: specialistId,
      business_id: f.business.id,
      name: "Мастер",
      active: true,
    })
    .execute();
  await db
    .insertInto("client")
    .values({
      id: clientId,
      business_id: f.business.id,
      name: "Клиент",
    })
    .execute();
  const bookingId = randomUUID();
  const starts = new Date(Date.now() + 86400000);
  const ends = new Date(starts.getTime() + 30 * 60000);
  await db
    .insertInto("booking")
    .values({
      id: bookingId,
      business_id: f.business.id,
      client_id: clientId,
      service_id: serviceId,
      specialist_id: specialistId,
      starts_at: starts,
      ends_at: ends,
      occupied_from: starts,
      occupied_until: ends,
      status: "confirmed",
      revision: 1,
      source: "manual",
      request_key: randomUUID(),
      request_hash: randomUUID().replace(/-/g, ""),
    })
    .execute();

  await f.solutions.resetSettings(f.owner.id, f.business.public_id, "booking");

  const service = await db
    .selectFrom("booking_service")
    .select("active")
    .where("id", "=", serviceId)
    .executeTakeFirstOrThrow();
  assert.equal(service.active, false);
  const booking = await db
    .selectFrom("booking")
    .select("id")
    .where("id", "=", bookingId)
    .executeTakeFirst();
  assert.ok(booking);
  const sol = await db
    .selectFrom("business_solution")
    .select("settings_reset_at")
    .where("business_id", "=", f.business.id)
    .where("solution_code", "=", "booking")
    .executeTakeFirstOrThrow();
  assert.ok(sol.settings_reset_at);
  const audits = await db
    .selectFrom("business_audit_log")
    .select("action")
    .where("business_id", "=", f.business.id)
    .where("action", "=", "solution.settings_reset")
    .execute();
  assert.equal(audits.length, 1);
});

test("8. operator cannot activate (403)", async () => {
  const f = await fixture();
  const op = await createUser("Operator");
  await db
    .insertInto("business_member")
    .values({
      business_id: f.business.id,
      user_id: op.id,
      role: "operator",
      status: "active",
    })
    .execute();
  await assert.rejects(
    () =>
      f.solutions.activate(op.id, f.business.public_id, {
        code: "orders",
        enabled: true,
      }),
    (e) =>
      !!e &&
      typeof e === "object" &&
      "status" in e &&
      e.status === 403 &&
      "code" in e &&
      e.code === "FORBIDDEN",
  );
});

test("9. Business A disable does not affect B", async () => {
  const a = await fixture("A");
  const b = await fixture("B");
  await a.solutions.activate(a.owner.id, a.business.public_id, {
    code: "orders",
    enabled: true,
  });
  await b.solutions.activate(b.owner.id, b.business.public_id, {
    code: "orders",
    enabled: true,
  });
  await addProduct(a.business.id);
  await addProduct(b.business.id);
  await a.solutions.activate(a.owner.id, a.business.public_id, {
    code: "orders",
    enabled: false,
  });
  const listA = (await a.solutions.list(a.owner.id, a.business.public_id)).find(
    (i) => i.solutionId === "sol_orders",
  );
  const listB = (await b.solutions.list(b.owner.id, b.business.public_id)).find(
    (i) => i.solutionId === "sol_orders",
  );
  assert.equal(listA?.lifecycleStatus, "disabled");
  assert.equal(listB?.entitlementStatus, "active");
  assert.notEqual(listB?.lifecycleStatus, "disabled");
});

test("10. disable resolves setup.abandoned notification", async () => {
  const f = await fixture();
  await f.solutions.activate(f.owner.id, f.business.public_id, {
    code: "leads",
    enabled: true,
  });
  await f.solutions.touchSetupDraft(f.business.id, "leads", { step: 1 });
  await db.transaction().execute((tx) =>
    notify(
      tx,
      f.business.id,
      "setup.abandoned",
      "setup:" + f.business.id + ":leads",
      "Незавершённая настройка",
      "/solutions",
    ),
  );
  const before = await f.notifications.list(f.owner.id, f.business.public_id);
  assert.ok(before.some((n) => n.type === "setup.abandoned" && !n.resolved_at));

  await f.solutions.activate(f.owner.id, f.business.public_id, {
    code: "leads",
    enabled: false,
  });
  const after = await f.notifications.list(f.owner.id, f.business.public_id);
  const note = after.find((n) => n.type === "setup.abandoned");
  assert.ok(note?.resolved_at);
});

test("11. booking reminder worker skips when booking disabled", async () => {
  const f = await fixture();
  await f.solutions.activate(f.owner.id, f.business.public_id, {
    code: "booking",
    enabled: true,
  });
  const serviceId = randomUUID();
  const specialistId = randomUUID();
  const clientId = randomUUID();
  await db
    .insertInto("booking_service")
    .values({
      id: serviceId,
      business_id: f.business.id,
      name: "Услуга",
      duration_minutes: 30,
      price: "100.00",
      currency: "RUB",
      active: true,
    })
    .execute();
  await db
    .insertInto("booking_specialist")
    .values({
      id: specialistId,
      business_id: f.business.id,
      name: "Спец",
      active: true,
    })
    .execute();
  await db
    .insertInto("client")
    .values({
      id: clientId,
      business_id: f.business.id,
      name: "Клиент",
    })
    .execute();
  const bookingId = randomUUID();
  const starts = new Date(Date.now() + 86400000);
  await db
    .insertInto("booking")
    .values({
      id: bookingId,
      business_id: f.business.id,
      client_id: clientId,
      service_id: serviceId,
      specialist_id: specialistId,
      starts_at: starts,
      ends_at: new Date(starts.getTime() + 1800000),
      occupied_from: starts,
      occupied_until: new Date(starts.getTime() + 1800000),
      status: "confirmed",
      revision: 1,
      source: "manual",
      request_key: randomUUID(),
      request_hash: randomUUID().replace(/-/g, ""),
    })
    .execute();
  const reminderId = randomUUID();
  await db
    .insertInto("booking_reminder")
    .values({
      id: reminderId,
      business_id: f.business.id,
      booking_id: bookingId,
      revision: 1,
      kind: "24h",
      due_at: new Date(0),
      status: "pending",
      last_error: null,
    })
    .execute();

  await f.solutions.activate(f.owner.id, f.business.public_id, {
    code: "booking",
    enabled: false,
  });
  const processed = await queueBookingReminder(db);
  assert.equal(processed, true);
  const reminder = await db
    .selectFrom("booking_reminder")
    .select(["status", "last_error"])
    .where("id", "=", reminderId)
    .executeTakeFirstOrThrow();
  assert.equal(reminder.status, "cancelled");
  assert.equal(reminder.last_error, "BOOKING_NOT_ENTITLED");
});

test("12. deny copy in router + assertCustomerActionAvailable for disabled", async () => {
  const { readFileSync } = await import("node:fs");
  const router = readFileSync(
    new URL("../src/server/bot/router.ts", import.meta.url),
    "utf8",
  );
  assert.match(router, /Эта функция временно недоступна\./);

  const f = await fixture();
  await f.solutions.activate(f.owner.id, f.business.public_id, {
    code: "booking",
    enabled: true,
  });
  await db
    .insertInto("booking_service")
    .values({
      id: randomUUID(),
      business_id: f.business.id,
      name: "Услуга",
      duration_minutes: 30,
      price: "100.00",
      currency: "RUB",
      active: true,
    })
    .execute();
  assert.equal(
    await assertCustomerActionAvailable(
      db,
      f.business.id,
      "telegram",
      "booking",
    ),
    true,
  );
  await f.solutions.activate(f.owner.id, f.business.public_id, {
    code: "booking",
    enabled: false,
  });
  assert.equal(
    await assertCustomerActionAvailable(
      db,
      f.business.id,
      "telegram",
      "booking",
    ),
    false,
  );
});
