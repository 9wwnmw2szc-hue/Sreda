import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Kysely, PGliteDialect } from "kysely";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/server/db/migrate.ts";
import { LeadFormService } from "../src/server/leads/forms.ts";
import { LeadService } from "../src/server/leads/service.ts";

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
      username: "u" + uid,
    })
    .execute();
  const b = await db
    .insertInto("business")
    .values({
      id: randomUUID(),
      name: "Leads biz",
      timezone: "Europe/Moscow",
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
      solution_code: "leads",
      status: "active",
    })
    .execute();
  return {
    uid,
    b,
    forms: new LeadFormService(db),
    leads: new LeadService(db),
  };
}

test("custom lead form fields CRUD", async () => {
  const f = await fixture();
  const created = await f.forms.save(f.uid, f.b.public_id, {
    field_key: "budget",
    label: "Бюджет",
    field_type: "budget",
    required: true,
    placeholder: "От 10 000",
    position: 1,
  });
  assert.equal(created.fieldKey, "budget");
  assert.equal(created.label, "Бюджет");
  assert.equal(created.required, true);
  assert.ok(created.active);

  const listed = await f.forms.list(f.uid, f.b.public_id);
  assert.ok(listed.some((row) => row.id === created.id));

  const updated = await f.forms.save(
    f.uid,
    f.b.public_id,
    {
      field_key: "budget",
      label: "Бюджет проекта",
      field_type: "number",
      required: false,
      placeholder: "",
      position: 2,
    },
    created.id,
  );
  assert.equal(updated.label, "Бюджет проекта");
  assert.equal(updated.fieldType, "number");
  assert.equal(updated.required, false);

  await f.forms.remove(f.uid, f.b.public_id, created.id);
  const after = await f.forms.list(f.uid, f.b.public_id);
  const soft = after.find((row) => row.id === created.id);
  assert.ok(soft);
  assert.equal(soft.active, false);
  const activeOnly = await f.forms.list(f.uid, f.b.public_id, true);
  assert.ok(!activeOnly.some((row) => row.id === created.id));
});

test("lead status history is recorded on transitions", async () => {
  const f = await fixture();
  const lead = await f.leads.create(f.uid, f.b.public_id, {
    source: "telegram",
    name: "Анна",
    phone: "+79991112233",
    message: "Нужна консультация",
  });
  assert.equal(lead.status, "new");
  await f.leads.updateStatus(f.uid, f.b.public_id, lead.id, "processing");
  await f.leads.updateStatus(f.uid, f.b.public_id, lead.id, "completed");
  const history = await db
    .selectFrom("lead_status_history")
    .selectAll()
    .where("business_id", "=", f.b.id)
    .where("lead_id", "=", lead.id)
    .orderBy("created_at")
    .execute();
  assert.ok(history.length >= 3);
  assert.equal(history[0].from_status, null);
  assert.equal(history[0].to_status, "new");
  assert.equal(history[1].from_status, "new");
  assert.equal(history[1].to_status, "processing");
  assert.equal(history[2].from_status, "processing");
  assert.equal(history[2].to_status, "completed");
  assert.equal(history[1].actor_user_id, f.uid);
});
