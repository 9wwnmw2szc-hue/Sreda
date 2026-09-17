import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Kysely, PGliteDialect } from "kysely";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/server/db/migrate.ts";
import { SolutionService } from "../src/server/solutions/service.ts";

const db = new Kysely({ dialect: new PGliteDialect({ pglite: new PGlite() }) });
before(() => migrate(db, new URL("../migrations", import.meta.url).pathname));
after(() => db.destroy());

async function fixture() {
  const uid = randomUUID();
  await db
    .insertInto("user")
    .values({
      id: uid,
      name: "Owner",
      email: uid + "@test.invalid",
      emailVerified: false,
      username: "u" + uid.slice(0, 8),
    })
    .execute();
  const business = await db
    .insertInto("business")
    .values({
      id: randomUUID(),
      name: "Студия",
      timezone: "Europe/Moscow",
      business_type: "hybrid",
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  await db
    .insertInto("business_member")
    .values({
      business_id: business.id,
      user_id: uid,
      role: "owner",
      status: "active",
    })
    .execute();
  return { uid, business, solutions: new SolutionService(db) };
}

test("solution list marks unimplemented products available instead of coming-soon", async () => {
  const f = await fixture();
  const list = await f.solutions.list(f.uid, f.business.public_id);
  assert.deepEqual(
    list.map((item) => item.solutionId).sort(),
    [
      "sol_admin_messages",
      "sol_autopost",
      "sol_booking",
      "sol_leads",
      "sol_orders",
    ],
  );
  const byCode = Object.fromEntries(
    list.map((item) => [item.solutionId, item.status]),
  );
  assert.equal(byCode.sol_leads, "available");
  assert.equal(byCode.sol_orders, "available");
  assert.equal(byCode.sol_booking, "available");
  assert.equal(byCode.sol_autopost, "available");
  assert.equal(byCode.sol_admin_messages, "available");
  assert.equal(list.some((item) => item.status === "unavailable"), false);
});

test("activating orders without products requires setup", async () => {
  const f = await fixture();
  await f.solutions.activate(f.uid, f.business.public_id, {
    code: "orders",
    enabled: true,
  });
  const orders = (await f.solutions.list(f.uid, f.business.public_id)).find(
    (item) => item.solutionId === "sol_orders",
  );
  assert.equal(orders?.status, "setup_required");
  assert.match(orders?.note ?? "", /товар/i);
});

test("activating booking without services requires setup", async () => {
  const f = await fixture();
  await f.solutions.activate(f.uid, f.business.public_id, {
    code: "booking",
    enabled: true,
  });
  const booking = (await f.solutions.list(f.uid, f.business.public_id)).find(
    (item) => item.solutionId === "sol_booking",
  );
  assert.equal(booking?.status, "setup_required");
});

test("activating autopost without targets requires setup", async () => {
  const f = await fixture();
  await f.solutions.activate(f.uid, f.business.public_id, {
    code: "autopost",
    enabled: true,
  });
  const autopost = (await f.solutions.list(f.uid, f.business.public_id)).find(
    (item) => item.solutionId === "sol_autopost",
  );
  assert.equal(autopost?.status, "setup_required");
});

test("activating inbox without channels requires setup", async () => {
  const f = await fixture();
  await f.solutions.activate(f.uid, f.business.public_id, {
    code: "admin_messages",
    enabled: true,
  });
  const inbox = (await f.solutions.list(f.uid, f.business.public_id)).find(
    (item) => item.solutionId === "sol_admin_messages",
  );
  assert.equal(inbox?.status, "setup_required");
});

test("orders becomes active after product exists and channel readiness is not required for catalog readiness note", async () => {
  const f = await fixture();
  await f.solutions.activate(f.uid, f.business.public_id, {
    code: "orders",
    enabled: true,
  });
  await db
    .insertInto("product")
    .values({
      id: randomUUID(),
      business_id: f.business.id,
      name: "Кофе",
      price: "250.00",
      currency: "RUB",
      active: true,
      position: 0,
      use_variants: false,
      track_inventory: false,
      availability: "in_stock",
    })
    .execute();
  const orders = (await f.solutions.list(f.uid, f.business.public_id)).find(
    (item) => item.solutionId === "sol_orders",
  );
  // Without ready channels the solution is paused, not unavailable/coming soon.
  assert.ok(["active", "paused"].includes(orders?.status ?? ""));
  assert.notEqual(orders?.status, "unavailable");
  assert.notEqual(orders?.status, "available");
});
