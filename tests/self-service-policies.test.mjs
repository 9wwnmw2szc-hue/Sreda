import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Kysely, PGliteDialect } from "kysely";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/server/db/migrate.ts";
import { BookingService } from "../src/server/booking/service.ts";

const db = new Kysely({ dialect: new PGliteDialect({ pglite: new PGlite() }) });
before(() => migrate(db, new URL("../migrations", import.meta.url).pathname));
after(() => db.destroy());

test("booking_settings self-service columns exist with safe defaults", async () => {
  const business = await db
    .insertInto("business")
    .values({
      id: randomUUID(),
      name: "Салон",
      timezone: "Europe/Moscow",
      business_type: "service",
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  await db
    .insertInto("booking_settings")
    .values({ business_id: business.id })
    .execute();
  const row = await db
    .selectFrom("booking_settings")
    .select([
      "allow_customer_cancel",
      "cancel_before_minutes",
      "allow_reschedule",
      "reschedule_before_minutes",
    ])
    .where("business_id", "=", business.id)
    .executeTakeFirstOrThrow();
  assert.equal(row.allow_customer_cancel, true);
  assert.equal(row.allow_reschedule, true);
  assert.equal(row.cancel_before_minutes, 0);
  assert.equal(row.reschedule_before_minutes, 0);
});

test("customer cancel denied when allow_customer_cancel is false", async () => {
  const ownerId = randomUUID();
  await db
    .insertInto("user")
    .values({
      id: ownerId,
      name: "Owner",
      email: `ss-${Date.now()}@example.test`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .execute();
  const business = await db
    .insertInto("business")
    .values({
      id: randomUUID(),
      public_id: "biz_ss_" + Date.now().toString(36),
      name: "Салон SS",
      timezone: "UTC",
      business_type: "service",
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  await db
    .insertInto("business_member")
    .values({
      business_id: business.id,
      user_id: ownerId,
      role: "owner",
      status: "active",
    })
    .execute();
  await db
    .insertInto("booking_settings")
    .values({
      business_id: business.id,
      allow_customer_cancel: false,
    })
    .execute();
  const clientId = randomUUID();
  await db
    .insertInto("client")
    .values({
      id: clientId,
      business_id: business.id,
      name: "Клиент",
      phone: null,
      email: null,
    })
    .execute();
  const serviceId = randomUUID();
  const specialistId = randomUUID();
  await db
    .insertInto("booking_service")
    .values({
      id: serviceId,
      business_id: business.id,
      name: "Стрижка",
      duration_minutes: 30,
      price: "500.00",
      currency: "RUB",
    })
    .execute();
  await db
    .insertInto("booking_specialist")
    .values({
      id: specialistId,
      business_id: business.id,
      name: "Мастер",
    })
    .execute();
  const starts = new Date(Date.now() + 3_600_000);
  const bookingId = randomUUID();
  await db
    .insertInto("booking")
    .values({
      id: bookingId,
      business_id: business.id,
      client_id: clientId,
      service_id: serviceId,
      specialist_id: specialistId,
      starts_at: starts,
      ends_at: new Date(+starts + 30 * 60_000),
      occupied_from: starts,
      occupied_until: new Date(+starts + 30 * 60_000),
      status: "confirmed",
      revision: 1,
      source: "telegram",
      request_key: "ss-" + bookingId.slice(0, 8),
      request_hash: "hash-" + bookingId.slice(0, 8),
    })
    .execute();

  const service = new BookingService(db);
  await assert.rejects(
    () =>
      db.transaction().execute((tx) =>
        service.changeInTransaction(
          tx,
          business.id,
          bookingId,
          { action: "cancel", revision: 1 },
          null,
          clientId,
        ),
      ),
    (e) =>
      !!e &&
      typeof e === "object" &&
      "code" in e &&
      e.code === "BOOKING_SELF_SERVICE_DENIED",
  );
});

test("order_settings table accepts customer_cancel_statuses", async () => {
  const business = await db
    .insertInto("business")
    .values({
      id: randomUUID(),
      name: "Магазин",
      timezone: "UTC",
      business_type: "store",
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  await db
    .insertInto("order_settings")
    .values({
      business_id: business.id,
      customer_cancel_statuses: ["new"],
    })
    .execute();
  const row = await db
    .selectFrom("order_settings")
    .selectAll()
    .where("business_id", "=", business.id)
    .executeTakeFirstOrThrow();
  assert.ok(row.customer_cancel_statuses);
});
