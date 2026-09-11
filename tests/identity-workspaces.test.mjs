import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Kysely, PGliteDialect, PostgresDialect, sql } from "kysely";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import { createIdentity } from "../src/server/identity/auth.ts";
import { WorkspaceService } from "../src/server/workspaces/service.ts";
import { createApplication } from "../src/server/http/application.ts";
import { createAuthHandler } from "../src/server/http/auth-handler.ts";
import { migrate } from "../src/server/db/migrate.ts";

const origin = "http://localhost:3000";
const secret = "test-only-" + randomUUID() + randomUUID();
const inbox = new Map();
const db = new Kysely({ dialect: process.env.TEST_DATABASE_URL
  ? new PostgresDialect({ pool: new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 5 }) })
  : new PGliteDialect({ pglite: new PGlite() }) });
const auth = createIdentity({ db, origin, secret, sendCode: async (email, code) => inbox.set(email, code) });
const workspaces = new WorkspaceService(db);
const app = createApplication({ auth, workspaces, origin });
const authHandler = createAuthHandler({ db, auth, origin, secret });
function request(path, { method = "GET", body, cookie = "", headers = {} } = {}) {
  return new Request(origin + path, { method, headers: {
    origin, "content-type": "application/json", cookie, ...headers,
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
const send = (email) => authHandler(request("/api/auth/email-otp/send-verification-otp",
  { method: "POST", body: { email } }));
const verify = (email, otp) => authHandler(request("/api/auth/sign-in/email-otp",
  { method: "POST", body: { email, otp, name: "Тестовый владелец" } }));
async function login() {
  const email = randomUUID() + "@example.test";
  assert.equal((await send(email)).status, 202);
  const response = await verify(email, inbox.get(email));
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  assert.deepEqual(await response.json(), { ok: true });
  const cookies = response.headers.getSetCookie();
  assert.ok(cookies.some((cookie) => /HttpOnly/i.test(cookie) && /SameSite=Lax/i.test(cookie)));
  const cookie = cookies.map((value) => value.split(";")[0]).join("; ");
  const profile = await app.me(request("/api/v1/me", { cookie }));
  assert.equal(profile.status, 200);
  return { cookie, user: await profile.json(), email };
}
async function create(account, name = "Кофейня", key = randomUUID()) {
  return app.businesses(request("/api/v1/businesses", { method: "POST", cookie: account.cookie,
    body: { name, timezone: "Europe/Kaliningrad" }, headers: { "idempotency-key": key } }));
}
before(async () => {
  await migrate(db, new URL("../migrations", import.meta.url).pathname);
  await migrate(db, new URL("../migrations", import.meta.url).pathname);
});
after(async () => { await db.destroy(); });

test("no session cannot list or create businesses", async () => {
  assert.equal((await app.businesses(request("/api/v1/businesses"))).status, 401);
  assert.equal((await app.businesses(request("/api/v1/businesses", { method: "POST", body: {} }))).status, 401);
  assert.equal((await app.me(request("/api/v1/me"))).status, 401);
});
test("email code signs in; JSON contains no session token; OTP storage is hashed", async () => {
  const account = await login();
  assert.ok(account.user.id);
  assert.equal(account.user.email, account.email);
  assert.deepEqual(Object.keys(account.user).sort(), ["email", "id", "name"]);
  assert.equal((await verify(account.email, inbox.get(account.email))).status, 400);
  const email = randomUUID() + "@example.test";
  await send(email);
  const records = await sql`select value from verification`.execute(db);
  assert.ok(records.rows.length);
  assert.ok(records.rows.every((record) => !record.value.includes(inbox.get(email))));
});
test("invalid and expired codes cannot create a session; resend is throttled", async () => {
  const email = randomUUID() + "@example.test";
  assert.equal((await send(email)).status, 202);
  assert.equal((await send(email)).status, 429);
  const incorrect = inbox.get(email) === "000000" ? "111111" : "000000";
  assert.equal((await verify(email, incorrect)).status, 400);
  await sql`update verification set "expiresAt" = now() - interval '1 minute'`.execute(db);
  assert.equal((await verify(email, inbox.get(email))).status, 400);
});
test("attempt exhaustion rejects even the correct OTP", async () => {
  const email = randomUUID() + "@example.test"; await send(email);
  const incorrect = inbox.get(email) === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++) await verify(email, incorrect);
  assert.notEqual((await verify(email, inbox.get(email))).status, 200);
});
test("business creation is atomic and replay returns the same business", async () => {
  const account = await login();
  const key = randomUUID();
  const first = await create(account, "Зёрно", key);
  assert.equal(first.status, 201);
  const business = await first.json();
  assert.equal(business.ownerId, account.user.id);
  assert.equal(business.role, "owner");
  assert.equal(business.timezone, "Europe/Kaliningrad");
  assert.equal((await (await create(account, "Зёрно", key)).json()).id, business.id);
  assert.equal((await create(account, "Другое название", key)).status, 409);
  const members = await db.selectFrom("business_member").selectAll().where("business_id", "=", business.id).execute();
  assert.equal(members.length, 1);
  assert.equal((await (await app.businesses(request("/api/v1/businesses", { cookie: account.cookie }))).json()).length, 1);
});
test("two users see only their businesses; unknown and foreign IDs return identical errors", async () => {
  const a = await login(); const b = await login();
  const aBusiness = await (await create(a, "Бизнес А")).json();
  const bBusiness = await (await create(b, "Бизнес Б")).json();
  const list = await (await app.businesses(request("/api/v1/businesses", { cookie: a.cookie }))).json();
  assert.deepEqual(list.map((item) => item.id), [aBusiness.id]);
  const foreign = await app.business(request("/api/v1/businesses/" + bBusiness.id, { cookie: a.cookie }), bBusiness.id);
  const missing = await app.business(request("/api/v1/businesses/" + randomUUID(), { cookie: a.cookie }), randomUUID());
  assert.equal(foreign.status, 404); assert.equal(missing.status, 404);
  const f = (await foreign.json()).error; const m = (await missing.json()).error;
  assert.equal(f.code, m.code); assert.equal(f.message, m.message);
  assert.equal((await app.business(request("/api/v1/businesses/" + aBusiness.id, { cookie: a.cookie }), aBusiness.id)).status, 200);
});
test("revoked membership denies the next request and operator cannot configure a business", async () => {
  const owner = await login(); const operator = await login();
  const business = await (await create(owner)).json();
  await db.insertInto("business_member").values({ business_id: business.id, user_id: operator.user.id,
    role: "operator", status: "active" }).execute();
  assert.equal((await workspaces.require(operator.user.id, business.id)).role, "operator");
  await assert.rejects(workspaces.require(operator.user.id, business.id, ["owner", "admin"]), { status: 403 });
  await db.updateTable("business_member").set({ status: "revoked" })
    .where("business_id", "=", business.id).where("user_id", "=", operator.user.id).execute();
  assert.equal((await app.business(request("/api/v1/businesses/" + business.id, { cookie: operator.cookie }), business.id)).status, 404);
});
test("database rejects a second owner and rolls back an orphan business", async () => {
  const owner = await login(); const other = await login();
  const business = await (await create(owner)).json();
  await assert.rejects(db.insertInto("business_member").values({ business_id: business.id,
    user_id: other.user.id, role: "owner", status: "active" }).execute());
  const before = await db.selectFrom("business").select("id").execute();
  await assert.rejects(workspaces.create(randomUUID(), { name: "Не сохранится", timezone: "UTC" }, randomUUID()));
  assert.equal((await db.selectFrom("business").select("id").execute()).length, before.length);
});
test("forged body, missing idempotency key, oversized body and CSRF are rejected", async () => {
  const account = await login();
  const base = { method: "POST", cookie: account.cookie, body: { name: "Бизнес", timezone: "UTC" } };
  assert.equal((await app.businesses(request("/api/v1/businesses", base))).status, 400);
  assert.equal((await app.businesses(request("/api/v1/businesses",
    { ...base, headers: { origin: "https://evil.example" } }))).status, 403);
  assert.equal((await app.businesses(request("/api/v1/businesses",
    { ...base, headers: { origin: "" } }))).status, 403);
  assert.equal((await app.businesses(request("/api/v1/businesses",
    { ...base, body: { ...base.body, ownerId: randomUUID() }, headers: { "idempotency-key": randomUUID() } }))).status, 400);
  assert.equal((await app.businesses(request("/api/v1/businesses",
    { ...base, body: { ...base.body, name: "А".repeat(5000) } }))).status, 413);
  assert.equal((await authHandler(request("/api/auth/sign-out", { method: "POST", body: {}, headers: { origin: "https://evil.example" } }))).status, 403);
});
test("logout revokes server session immediately, expired sessions are rejected", async () => {
  const account = await login();
  const response = await authHandler(request("/api/auth/sign-out", { method: "POST", cookie: account.cookie, body: {} }));
  assert.equal(response.status, 200);
  assert.equal((await app.me(request("/api/v1/me", { cookie: account.cookie }))).status, 401);
  const expired = await login();
  await sql`update session set "expiresAt" = now() - interval '1 second' where "userId" = ${expired.user.id}::uuid`.execute(db);
  assert.equal((await app.me(request("/api/v1/me", { cookie: expired.cookie }))).status, 401);
});
test("concurrent creation is deduplicated across PostgreSQL connections", {
  skip: !process.env.TEST_DATABASE_URL && "PGlite has one connection; concurrency runs against PostgreSQL in CI",
}, async () => {
  const account = await login(); const key = randomUUID();
  const results = await Promise.all(Array.from({ length: 5 }, () => create(account, "Один бизнес", key)));
  for (const result of results) assert.equal(result.status, 201);
  const ids = await Promise.all(results.map(async (result) => (await result.json()).id));
  assert.equal(new Set(ids).size, 1);
});
test("parallel verification consumes an OTP only once on PostgreSQL", {
  skip: !process.env.TEST_DATABASE_URL && "Requires separate PostgreSQL connections",
}, async () => {
  const email = randomUUID() + "@example.test";
  assert.equal((await send(email)).status, 202);
  const results = await Promise.all([verify(email, inbox.get(email)), verify(email, inbox.get(email))]);
  assert.equal(results.filter((response) => response.status === 200).length, 1);
});
