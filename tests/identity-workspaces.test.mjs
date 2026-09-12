import { betterAuth } from "better-auth";
import { verifyPassword } from "better-auth/crypto";
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Kysely, PGliteDialect, PostgresDialect, sql } from "kysely";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import { createIdentity } from "../src/server/identity/auth.ts";
import { WorkspaceService } from "../src/server/workspaces/service.ts";
import { InvitationService } from "../src/server/invitations/service.ts";
import { ConnectionService } from "../src/server/connections/service.ts";
import { LeadService } from "../src/server/leads/service.ts";
import { createApplication } from "../src/server/http/application.ts";
import { createAuthHandler } from "../src/server/http/auth-handler.ts";
import { createRecoveryHandler } from "../src/server/http/recovery-handler.ts";
import { createPasswordHandler } from "../src/server/http/password-handler.ts";
import { RecoveryService } from "../src/server/identity/recovery.ts";
import { migrate } from "../src/server/db/migrate.ts";

const origin = "http://localhost:3000";
const secret = "test-only-" + randomUUID() + randomUUID();
const password = "test-password-12345";
const db = new Kysely({ dialect: process.env.TEST_DATABASE_URL
  ? new PostgresDialect({ pool: new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 5 }) })
  : new PGliteDialect({ pglite: new PGlite() }) });
const auth = createIdentity({ db, origin, secret });
const workspaces = new WorkspaceService(db);
const invitations = new InvitationService(db);
const app = createApplication({ auth, workspaces, invitations, db, origin });
const authHandler = createAuthHandler({ db, auth, origin, secret });
const recoveryHandler = createRecoveryHandler({ db, auth, origin, secret });
const recovery = new RecoveryService(db);
const passwordHandler = createPasswordHandler({ db, auth, origin, secret });
function request(path, { method = "GET", body, cookie = "", headers = {} } = {}) {
  return new Request(origin + path, { method, headers: {
    origin, "content-type": "application/json", cookie, ...headers,
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
const signup = (username, confirmation = password) => authHandler(request("/api/auth/sign-up/username",
  { method: "POST", body: { username, password, passwordConfirmation: confirmation } }));
const signin = (username, value = password) => authHandler(request("/api/auth/sign-in/username",
  { method: "POST", body: { username, password: value } }));
const freshUsername = () => "u" + randomUUID().replaceAll("-", "").slice(0, 24);
async function login() {
  const username = freshUsername();
  const response = await signup(username);
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  assert.deepEqual(await response.json(), { ok: true });
  const cookies = response.headers.getSetCookie();
  assert.ok(cookies.some((cookie) => /HttpOnly/i.test(cookie) && /SameSite=Lax/i.test(cookie)));
  const cookie = cookies.map((value) => value.split(";")[0]).join("; ");
  const profile = await app.me(request("/api/v1/me", { cookie }));
  assert.equal(profile.status, 200);
  const publicUser = await profile.json();
  const internal = await db.selectFrom("user").select("id").where("public_id", "=", publicUser.id).executeTakeFirstOrThrow();
  return { cookie, user: publicUser, username, internalId: internal.id };
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

test("recovery issuance requires session, origin and current password; status exposes no codes", async () => {
  const account = await login();
  assert.equal((await recoveryHandler(request("/codes"), "codes")).status, 401);
  assert.equal((await recoveryHandler(request("/codes", { method: "POST", cookie: account.cookie, headers: { origin: "https://evil.example" }, body: { currentPassword: password } }), "codes")).status, 403);
  assert.equal((await recoveryHandler(request("/codes", { method: "POST", cookie: account.cookie, body: { currentPassword: "wrong-password-123" } }), "codes")).status, 400);
  const issued = await recoveryHandler(request("/codes", { method: "POST", cookie: account.cookie, body: { currentPassword: password, userId: randomUUID() } }), "codes");
  assert.equal(issued.status, 200); assert.equal(issued.headers.get("cache-control"), "no-store");
  const { codes } = await issued.json(); assert.equal(codes.length, 8); assert.equal(new Set(codes).size, 8);
  for (const code of codes) assert.match(code, /^[A-F0-9]{4}(-[A-F0-9]{4}){7}$/);
  const rows = await db.selectFrom("recovery_code").selectAll().where("user_id", "=", account.internalId).execute();
  assert.equal(rows.length, 8); assert.ok(rows.every((row) => !codes.includes(row.code_hash) && !codes.map((c) => c.replaceAll("-", "").toLowerCase()).includes(row.code_hash)));
  const status = await (await recoveryHandler(request("/codes", { cookie: account.cookie }), "codes")).json();
  assert.deepEqual(Object.keys(status).sort(), ["issuedAt", "remaining"]); assert.equal(status.remaining, 8);
});

test("recovery consumes one code, resets password and revokes every existing session", async () => {
  const account = await login();
  await signin(account.username);
  const { codes } = await recovery.issue(account.internalId, password);
  const nextPassword = "new-test-password-56789";
  const body = { username: account.username.toUpperCase(), recoveryCode: codes[0], newPassword: nextPassword, passwordConfirmation: nextPassword };
  await assert.rejects(recovery.recover({ ...body, passwordConfirmation: "mismatch" }), { status: 400 });
  assert.equal((await recovery.status(account.internalId)).remaining, 8);
  const response = await recoveryHandler(request("/recover", { method: "POST", body }), "recover");
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ok: true });
  assert.equal((await recovery.status(account.internalId)).remaining, 7);
  assert.equal((await db.selectFrom("session").selectAll().where("userId", "=", account.internalId).execute()).length, 0);
  assert.equal((await app.me(request("/api/v1/me", { cookie: account.cookie }))).status, 401);
  assert.equal((await signin(account.username)).status, 400);
  assert.equal((await signin(account.username, nextPassword)).status, 200);
  await assert.rejects(recovery.recover(body), { code: "RECOVERY_FAILED" });
});

test("regeneration invalidates old codes; another user's code cannot reset an account", async () => {
  const a = await login(); const b = await login();
  const first = await recovery.issue(a.internalId, password);
  const other = await recovery.issue(b.internalId, password);
  const second = await recovery.issue(a.internalId, password);
  const body = { username: a.username, newPassword: "changed-password-4321", passwordConfirmation: "changed-password-4321" };
  for (const recoveryCode of [first.codes[0], other.codes[0], "0000-".repeat(7) + "0000"]) await assert.rejects(recovery.recover({ ...body, recoveryCode }), { code: "RECOVERY_FAILED" });
  await recovery.recover({ ...body, recoveryCode: second.codes[0].toLowerCase() });
  assert.equal((await recovery.status(b.internalId)).remaining, 8);
  assert.equal((await signin(b.username)).status, 200);
});

test("failed recovery has generic errors, CSRF protection and rate limits", async () => {
  const account = await login();
  const { codes } = await recovery.issue(account.internalId, password);
  const body = { username: account.username, recoveryCode: "0".repeat(32), newPassword: "changed-password-4321", passwordConfirmation: "changed-password-4321" };
  assert.equal((await recoveryHandler(request("/recover", { method: "POST", headers: { origin: "" }, body: { ...body, recoveryCode: codes[0] } }), "recover")).status, 403);
  const missing = await recoveryHandler(request("/recover", { method: "POST", body: { ...body, username: freshUsername() } }), "recover");
  const wrong = await recoveryHandler(request("/recover", { method: "POST", body }), "recover");
  assert.equal((await missing.json()).error.code, (await wrong.json()).error.code);
  for (let i = 0; i < 4; i++) assert.equal((await recoveryHandler(request("/recover", { method: "POST", body }), "recover")).status, 400);
  assert.equal((await recoveryHandler(request("/recover", { method: "POST", body: { ...body, recoveryCode: codes[0] } }), "recover")).status, 429);
  assert.equal((await recovery.status(account.internalId)).remaining, 8);
});

test("recovery rolls back consumed code, password and sessions if audit fails", async () => {
  const account = await login(); const { codes } = await recovery.issue(account.internalId, password);
  await sql`ALTER TABLE account_security_event ADD CONSTRAINT reject_recovery_test CHECK (action <> 'password_recovered') NOT VALID`.execute(db);
  try { await assert.rejects(recovery.recover({ username: account.username, recoveryCode: codes[0], newPassword: "changed-password-4321", passwordConfirmation: "changed-password-4321" })); }
  finally { await sql`ALTER TABLE account_security_event DROP CONSTRAINT reject_recovery_test`.execute(db); }
  assert.equal((await recovery.status(account.internalId)).remaining, 8);
  assert.equal((await signin(account.username)).status, 200);
  assert.equal((await app.me(request("/me", { cookie: account.cookie }))).status, 200);
});

test("concurrent recovery cannot reuse a code on PostgreSQL", {
  skip: !process.env.TEST_DATABASE_URL && "Requires separate PostgreSQL connections",
}, async () => {
  const account = await login(); const { codes } = await recovery.issue(account.internalId, password);
  const body = { username: account.username, recoveryCode: codes[0], newPassword: "changed-password-4321", passwordConfirmation: "changed-password-4321" };
  const results = await Promise.allSettled([recovery.recover(body), recovery.recover(body)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await recovery.status(account.internalId)).remaining, 7);
});

test("no session cannot list or create businesses", async () => {
  assert.equal((await app.businesses(request("/api/v1/businesses"))).status, 401);
  assert.equal((await app.businesses(request("/api/v1/businesses", { method: "POST", body: {} }))).status, 401);
  assert.equal((await app.me(request("/api/v1/me"))).status, 401);
});
test("username signup and login; password hashed; JSON has no email or session token", async () => {
  const account = await login();
  assert.equal(account.user.username, account.username);
  assert.deepEqual(Object.keys(account.user).sort(), ["id", "name", "username"]);
  const records = await sql`select password from account where "userId" = ${account.internalId}::uuid`.execute(db);
  assert.ok(records.rows[0].password);
  assert.ok(!records.rows[0].password.includes(password));
  const response = await signin(account.username.toUpperCase());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal((await signup(account.username.toUpperCase())).status, 409);
});
test("mismatched passwords and invalid usernames do not create accounts", async () => {
  const username = freshUsername();
  assert.equal((await signup(username, "different-password")).status, 400);
  assert.equal((await signin(username)).status, 400);
  assert.equal((await signup("bad@login")).status, 400);
  assert.equal((await signup(username)).status, 200);
  assert.equal((await signin(username, "incorrect-password")).status, 400);
  for (const path of ["/sign-up/email", "/sign-in/email", "/email-otp/send-verification-otp", "/sign-in/email-otp"]) {
    assert.equal((await authHandler(request("/api/auth" + path, { method: "POST", body: {} }))).status, 404);
  }
});
test("failed password attempts are throttled", async () => {
  const account = await login();
  for (let i = 0; i < 10; i++) assert.equal((await signin(account.username, "incorrect-password")).status, 400);
  assert.equal((await signin(account.username)).status, 429);
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
  const internalBusiness = await db.selectFrom("business").select("id").where("public_id", "=", business.id).executeTakeFirstOrThrow();
  const members = await db.selectFrom("business_member").selectAll().where("business_id", "=", internalBusiness.id).execute();
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
  const internalBusiness = await db.selectFrom("business").select("id").where("public_id", "=", business.id).executeTakeFirstOrThrow();
  const internalOperator = await db.selectFrom("user").select("id").where("public_id", "=", operator.user.id).executeTakeFirstOrThrow();
  await db.insertInto("business_member").values({ business_id: internalBusiness.id, user_id: internalOperator.id,
    role: "operator", status: "active" }).execute();
  assert.equal((await workspaces.require(operator.user.id, business.id)).role, "operator");
  await assert.rejects(workspaces.require(operator.user.id, business.id, ["owner", "admin"]), { status: 403 });
  await db.updateTable("business_member").set({ status: "revoked" })
    .where("business_id", "=", internalBusiness.id).where("user_id", "=", internalOperator.id).execute();
  assert.equal((await app.business(request("/api/v1/businesses/" + business.id, { cookie: operator.cookie }), business.id)).status, 404);
});
test("database rejects a second owner and rolls back an orphan business", async () => {
  const owner = await login(); const other = await login();
  const business = await (await create(owner)).json();
  const internalBusiness = await db.selectFrom("business").select("id").where("public_id", "=", business.id).executeTakeFirstOrThrow();
  const internalOther = await db.selectFrom("user").select("id").where("public_id", "=", other.user.id).executeTakeFirstOrThrow();
  await assert.rejects(db.insertInto("business_member").values({ business_id: internalBusiness.id,
    user_id: internalOther.id, role: "owner", status: "active" }).execute());
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
  await sql`update session set "expiresAt" = now() - interval '1 second' where "userId" = ${expired.internalId}::uuid`.execute(db);
  assert.equal((await app.me(request("/api/v1/me", { cookie: expired.cookie }))).status, 401);
});
test("owner invites a user, acceptance creates membership, and duplicate invite is rejected", async () => {
  const owner = await login(); const invitee = await login();
  const business = await (await create(owner, "Команда")).json();
  const invite = await app.invitations(request(`/api/v1/businesses/${business.id}/invitations`, { method: "POST", cookie: owner.cookie, body: { userId: invitee.user.id, role: "admin" } }), business.id);
  assert.equal(invite.status, 201); const invitation = await invite.json();
  assert.equal((await app.invitations(request("/api/v1/invitations", { cookie: invitee.cookie }))).status, 200);
  assert.equal((await app.invitations(request(`/api/v1/businesses/${business.id}/invitations`, { method: "POST", cookie: owner.cookie, body: { userId: invitee.user.id, role: "admin" } }), business.id)).status, 409);
  const accepted = await app.invitations(request(`/api/v1/invitations/${invitation.id}/accept`, { method: "POST", cookie: invitee.cookie, body: {} }), invitation.id, "accept");
  assert.equal(accepted.status, 200); assert.equal((await workspaces.require(invitee.user.id, business.id)).role, "admin");
});
test("operator cannot invite, and owner can revoke a pending invitation", async () => {
  const owner = await login(); const operator = await login(); const target = await login();
  const business = await (await create(owner, "Доступ")).json();
  const internalBusiness = await db.selectFrom("business").select("id").where("public_id", "=", business.id).executeTakeFirstOrThrow();
  const internalOperator = await db.selectFrom("user").select("id").where("public_id", "=", operator.user.id).executeTakeFirstOrThrow();
  await db.insertInto("business_member").values({ business_id: internalBusiness.id, user_id: internalOperator.id, role: "operator", status: "active" }).execute();
  assert.equal((await app.invitations(request(`/api/v1/businesses/${business.id}/invitations`, { method: "POST", cookie: operator.cookie, body: { userId: target.user.id, role: "operator" } }), business.id)).status, 403);
  const created = await app.invitations(request(`/api/v1/businesses/${business.id}/invitations`, { method: "POST", cookie: owner.cookie, body: { userId: target.user.id, role: "operator" } }), business.id);
  const invitation = await created.json();
  assert.equal((await app.invitations(request(`/api/v1/businesses/${business.id}/invitations/${invitation.id}`, { method: "POST", cookie: owner.cookie, body: {} }), business.id, invitation.id)).status, 200);
  assert.equal((await app.invitations(request(`/api/v1/invitations/${invitation.id}/accept`, { method: "POST", cookie: target.cookie, body: {} }), invitation.id, "accept")).status, 404);
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
test("parallel signup cannot duplicate a username on PostgreSQL", {
  skip: !process.env.TEST_DATABASE_URL && "Requires separate PostgreSQL connections",
}, async () => {
  const username = freshUsername();
  const results = await Promise.all([signup(username), signup(username)]);
  assert.equal(results.filter((response) => response.status === 200).length, 1);
  const records = await sql`select id from "user" where username = ${username}`.execute(db);
  assert.equal(records.rows.length, 1);
});

test("invitation history allows re-invites, expired invitations and revoked access stay invalid", async () => {
  const owner = await login(); const member = await login();
  const business = await (await create(owner)).json();
  const first = await invitations.create(owner.internalId, business.id, member.user.id, "admin");
  assert.equal(first.businessId, business.id);
  await db.updateTable("business_invitation").set({ expires_at: new Date(0) }).where("id", "=", first.id).execute();
  const second = await invitations.create(owner.internalId, business.id, member.user.id, "operator");
  await assert.rejects(invitations.accept(member.internalId, first.id), { status: 404 });
  await invitations.accept(member.internalId, second.id);
  await assert.rejects(invitations.create(owner.internalId, business.id, member.user.id, "admin"), { status: 409 });
  await invitations.changeRole(owner.internalId, business.id, member.user.id, "admin");
  await invitations.revokeMember(owner.internalId, business.id, member.user.id);
  await assert.rejects(invitations.accept(member.internalId, second.id), { status: 404 });
  for (let i = 0; i < 2; i++) {
    const next = await invitations.create(owner.internalId, business.id, member.user.id, "operator");
    await invitations.revoke(owner.internalId, business.id, next.id);
  }
  const final = await invitations.create(owner.internalId, business.id, member.user.id, "operator");
  await invitations.accept(member.internalId, final.id);
  assert.equal((await workspaces.require(member.user.id, business.id)).role, "operator");
  await assert.rejects(invitations.changeRole(owner.internalId, business.id, owner.user.id, "operator"), { status: 404 });
  const unknown = await app.members(request("/members", { method: "POST", cookie: owner.cookie, body: { action: "typo", userId: member.user.id } }), business.id);
  assert.equal(unknown.status, 400);
  assert.equal((await workspaces.require(member.user.id, business.id)).role, "operator");
});

test("membership mutation and audit are atomic; archived business rejects invitations", async () => {
  const owner = await login(); const member = await login();
  const business = await (await create(owner)).json();
  const invited = await invitations.create(owner.internalId, business.id, member.user.id, "admin");
  await invitations.accept(member.internalId, invited.id);
  await db.transaction().execute(async (tx) => {
    await sql`ALTER TABLE business_audit_log ADD CONSTRAINT test_reject_revoke CHECK (action <> 'member_revoked') NOT VALID`.execute(tx);
  });
  try { await assert.rejects(invitations.revokeMember(owner.internalId, business.id, member.user.id)); }
  finally { await sql`ALTER TABLE business_audit_log DROP CONSTRAINT test_reject_revoke`.execute(db); }
  assert.equal((await workspaces.require(member.user.id, business.id)).role, "admin");
  const audit = await invitations.auditLog(owner.internalId, business.id);
  assert.ok(audit.every((entry) => entry.actorUserId.startsWith("usr_") && entry.actorUsername));
  await db.updateTable("business").set({ archived_at: new Date() }).where("public_id", "=", business.id).execute();
  await assert.rejects(invitations.members(owner.internalId, business.id), { status: 404 });
  assert.equal((await invitations.list(member.internalId)).some((item) => item.businessId === business.id), false);
});

test("connections verify bot, encrypt token, enforce scope and delete secret through API", async () => {
  const owner = await login(); const stranger = await login();
  const business = await (await create(owner)).json(); const other = await (await create(stranger)).json();
  const token = "123456789:fake-test-token-not-a-credential";
  const connections = new ConnectionService(db, secret, async (_url, options) => {
    assert.equal(options.redirect, "error");
    return Response.json({ ok: true, result: { id: 123456789, is_bot: true, username: "test_bot" } });
  });
  const application = createApplication({ auth, workspaces, db, connections, origin });
  await connections.connect(owner.internalId, business.id, { platform: "telegram", token });
  const stored = await db.selectFrom("connection_secret").selectAll().execute();
  assert.ok(stored.length > 0 && stored.every((item) => !item.encrypted_token.includes(token)));
  assert.ok(!JSON.stringify(await connections.list(owner.internalId, business.id)).includes(token));
  await assert.rejects(connections.connect(stranger.internalId, other.id, { platform: "telegram", token }), { status: 409 });
  await assert.rejects(connections.disconnect(stranger.internalId, business.id, "telegram"), { status: 404 });
  assert.equal((await application.connections(request("/connections?platform=telegram", { method: "DELETE", cookie: owner.cookie, headers: { origin: "https://evil.example" } }), business.id)).status, 403);
  assert.equal((await application.connections(request("/connections?platform=telegram", { method: "DELETE", cookie: owner.cookie }), business.id)).status, 200);
  assert.equal((await db.selectFrom("connection_secret").selectAll().execute()).length, 0);
  assert.equal((await connections.list(owner.internalId, business.id))[0].status, "disconnected");
  await connections.connect(stranger.internalId, other.id, { platform: "telegram", token });
});

test("leads are scoped, return public business ID and deduplicate channel event", async () => {
  const owner = await login(); const stranger = await login();
  const business = await (await create(owner)).json(); const leads = new LeadService(db);
  const input = { source: "telegram", name: "Клиент", externalEventId: "event-1" };
  const first = await leads.create(owner.internalId, business.id, input);
  assert.equal(first.businessId, business.id);
  assert.equal((await leads.create(owner.internalId, business.id, input)).id, first.id);
  await assert.rejects(leads.updateStatus(stranger.internalId, business.id, first.id, "closed"), { status: 404 });
  assert.equal((await leads.updateStatus(owner.internalId, business.id, first.id, "closed")).businessId, business.id);
  await assert.rejects(leads.updateStatus(owner.internalId, business.id, "invalid", "closed"), { status: 404 });
  assert.equal((await leads.list(owner.internalId, business.id)).length, 1);
});

test("parallel invitation acceptance and lead replay serialize on PostgreSQL", {
  skip: !process.env.TEST_DATABASE_URL && "Requires separate PostgreSQL connections",
}, async () => {
  const owner = await login(); const member = await login();
  const business = await (await create(owner)).json();
  const results = await Promise.allSettled(Array.from({ length: 3 }, () => invitations.create(owner.internalId, business.id, member.user.id, "operator")));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const invitation = results.find((r) => r.status === "fulfilled").value;
  const accepted = await Promise.allSettled([invitations.accept(member.internalId, invitation.id), invitations.accept(member.internalId, invitation.id)]);
  assert.equal(accepted.filter((r) => r.status === "fulfilled").length, 1);
  const leads = new LeadService(db);
  const created = await Promise.all(Array.from({ length: 4 }, () => leads.create(owner.internalId, business.id, { source: "telegram", name: "Клиент", externalEventId: "concurrent-1" })));
  assert.equal(new Set(created.map((item) => item.id)).size, 1);
});


test("password change retains current session, revokes others and preserves recovery codes and other users", async () => {
  const a = await login(); const b = await login();
  const second = await signin(a.username);
  const secondCookie = second.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const { codes } = await recovery.issue(a.internalId, password);
  const next = "changed-password-98765";
  const response = await passwordHandler(request("/password", { method: "POST", cookie: a.cookie, body: { currentPassword: password, newPassword: next, passwordConfirmation: next, userId: b.internalId, revokeOtherSessions: false } }));
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ok: true });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await app.me(request("/api/v1/me", { cookie: a.cookie }))).status, 200);
  assert.equal((await app.me(request("/api/v1/me", { cookie: secondCookie }))).status, 401);
  assert.equal((await app.me(request("/api/v1/me", { cookie: b.cookie }))).status, 200);
  assert.equal((await signin(a.username)).status, 400);
  assert.equal((await signin(a.username, next)).status, 200);
  assert.equal((await signin(b.username)).status, 200);
  assert.equal((await recovery.status(a.internalId)).remaining, 8);
  await recovery.recover({ username: a.username, recoveryCode: codes[0], newPassword: password, passwordConfirmation: password });
  const events = await db.selectFrom("account_security_event").select("action").where("user_id", "=", a.internalId).where("action", "=", "password_changed").execute();
  assert.equal(events.length, 1);
});

test("password change requires session, origin, matching passwords and limits guesses", async () => {
  const a = await login(); const next = "changed-password-98765";
  const body = { currentPassword: password, newPassword: next, passwordConfirmation: next };
  const call = (patch = {}, headers = {}) => passwordHandler(request("/password", { method: "POST", cookie: a.cookie, body: { ...body, ...patch }, headers }));
  assert.equal((await passwordHandler(request("/password", { method: "POST", body }))).status, 401);
  assert.equal((await passwordHandler(request("/password", { cookie: a.cookie }))).status, 405);
  assert.equal((await call({}, { origin: "https://evil.example" })).status, 403);
  assert.equal((await call({ passwordConfirmation: "mismatch" })).status, 400);
  for (let i = 0; i < 4; i++) assert.equal((await call({ currentPassword: "wrong-password-1234" })).status, 400);
  assert.equal((await call()).status, 429);
  assert.equal((await signin(a.username)).status, 200);
});

test("password change rolls back credential and session changes when audit fails", async () => {
  const a = await login(); await signin(a.username);
  const before = await db.selectFrom("session").select("id").where("userId", "=", a.internalId).execute();
  await sql`ALTER TABLE account_security_event ADD CONSTRAINT reject_change_test CHECK (action <> 'password_changed') NOT VALID`.execute(db);
  try {
    const result = await passwordHandler(request("/password", { method: "POST", cookie: a.cookie, body: { currentPassword: password, newPassword: "changed-password-98765", passwordConfirmation: "changed-password-98765" } }));
    assert.equal(result.status, 503);
  } finally { await sql`ALTER TABLE account_security_event DROP CONSTRAINT reject_change_test`.execute(db); }
  const after = await db.selectFrom("session").select("id").where("userId", "=", a.internalId).execute();
  assert.deepEqual(after.map((s) => s.id).sort(), before.map((s) => s.id).sort());
  assert.equal((await signin(a.username)).status, 200);
});


test("concurrent password changes cannot both accept the old password on PostgreSQL", {
  skip: !process.env.TEST_DATABASE_URL && "Requires separate PostgreSQL connections",
}, async () => {
  const a = await login();
  const call = (next) => passwordHandler(request("/password", { method: "POST", cookie: a.cookie, body: { currentPassword: password, newPassword: next, passwordConfirmation: next } }));
  const results = await Promise.all([call("concurrent-password-one"), call("concurrent-password-two")]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
  const events = await db.selectFrom("account_security_event").select("id").where("user_id", "=", a.internalId).where("action", "=", "password_changed").execute();
  assert.equal(events.length, 1);
});


// Pause the real library after it has verified a password, before it inserts a
// session. Explicit barriers make the formerly vulnerable ordering deterministic.
for (const operation of ["change", "recover"]) {
  test(`in-flight login cannot survive password ${operation}`, { timeout: 20000 }, async () => {
    const a = await login(); const other = await login();
    const { codes } = await recovery.issue(a.internalId, password);
    const verified = Promise.withResolvers(); const resume = Promise.withResolvers();
    const delayedAuth = betterAuth({ ...auth.options, emailAndPassword: {
      ...auth.options.emailAndPassword,
      password: { verify: async (input) => {
        const valid = await verifyPassword(input);
        verified.resolve(); await resume.promise; return valid;
      } },
    } });
    const handler = createAuthHandler({ db, auth: delayedAuth, origin, secret });
    const pending = handler(request("/api/auth/sign-in/username", { method: "POST", body: { username: a.username, password } }));
    const next = "race-safe-password-12345";
    try {
      await Promise.race([verified.promise, pending.then(() => { throw new Error("Login finished before verification barrier"); })]);
      if (operation === "change") {
        const changed = await passwordHandler(request("/password", { method: "POST", cookie: a.cookie, body: { currentPassword: password, newPassword: next, passwordConfirmation: next } }));
        assert.equal(changed.status, 200);
      } else {
        await recovery.recover({ username: a.username, recoveryCode: codes[0], newPassword: next, passwordConfirmation: next });
      }
    } finally { resume.resolve(); }
    const response = await pending;
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "AUTH_FAILED");
    assert.deepEqual(response.headers.getSetCookie(), []);
    const remaining = await db.selectFrom("session").select("id").where("userId", "=", a.internalId).execute();
    assert.equal(remaining.length, operation === "change" ? 1 : 0);
    assert.equal((await app.me(request("/api/v1/me", { cookie: other.cookie }))).status, 200);
    assert.equal((await signin(a.username, next)).status, 200);
    assert.equal((await signin(a.username)).status, 400);
  });
}

test("login completed before password reset is revoked by reset", async () => {
  const a = await login(); const { codes } = await recovery.issue(a.internalId, password);
  const signedIn = await signin(a.username);
  assert.equal(signedIn.status, 200);
  const cookie = signedIn.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  await recovery.recover({ username: a.username, recoveryCode: codes[0], newPassword: "reverse-race-password-1234", passwordConfirmation: "reverse-race-password-1234" });
  assert.equal((await app.me(request("/api/v1/me", { cookie }))).status, 401);
});
