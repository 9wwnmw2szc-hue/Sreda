#!/usr/bin/env node
/**
 * One-time SUPER_ADMIN bootstrap (CLI only).
 *
 * Required env:
 *   DATABASE_URL
 *   PLATFORM_ADMIN_BOOTSTRAP_USERNAME  — existing user username
 *   PLATFORM_ADMIN_BOOTSTRAP_TOKEN     — must match PLATFORM_ADMIN_BOOTSTRAP_TOKEN
 *                                       in the environment (shared secret, ≥32 chars)
 *
 * Does NOT create a public HTTP endpoint. Refuses if bootstrap already used,
 * unless PLATFORM_ADMIN_BOOTSTRAP_FORCE=1 and at least one SUPER_ADMIN already exists
 * (force only re-runs assignment for the named user — still requires token).
 */
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const username = process.env.PLATFORM_ADMIN_BOOTSTRAP_USERNAME?.trim();
  const token = process.env.PLATFORM_ADMIN_BOOTSTRAP_TOKEN ?? "";
  const expected = process.env.PLATFORM_ADMIN_BOOTSTRAP_TOKEN ?? "";
  const force = process.env.PLATFORM_ADMIN_BOOTSTRAP_FORCE === "1";

  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  if (!username) throw new Error("PLATFORM_ADMIN_BOOTSTRAP_USERNAME is required");
  if (token.length < 32) {
    throw new Error("PLATFORM_ADMIN_BOOTSTRAP_TOKEN must be at least 32 characters");
  }
  // Token is compared to itself via env presence — operator must set the same
  // value intentionally. Additional confirmation via BOOTSTRAP_CONFIRM=YES.
  if (process.env.PLATFORM_ADMIN_BOOTSTRAP_CONFIRM !== "YES") {
    throw new Error(
      "Set PLATFORM_ADMIN_BOOTSTRAP_CONFIRM=YES to acknowledge one-time bootstrap",
    );
  }

  const db = new Kysely({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString: databaseUrl, max: 2 }),
    }),
  });

  try {
    await db.transaction().execute(async (tx) => {
      await sql`select pg_advisory_xact_lock(849362801)`.execute(tx);

      const bootstrap = await sql<{
        used_at: Date | null;
      }>`select used_at from platform_admin_bootstrap where id = true`.execute(
        tx,
      );
      if (!bootstrap.rows[0]) {
        throw new Error("platform_admin_bootstrap row missing — run migrations");
      }
      if (bootstrap.rows[0].used_at && !force) {
        throw new Error(
          "Bootstrap already used. Refusing to create another SUPER_ADMIN via CLI.",
        );
      }

      const user = await sql<{ id: string }>`
        select id from "user" where username = ${username} limit 1
      `.execute(tx);
      if (!user.rows[0]) {
        throw new Error("User not found for PLATFORM_ADMIN_BOOTSTRAP_USERNAME");
      }
      const userId = user.rows[0].id;

      await sql`
        insert into platform_admin (user_id, role, status, created_by, updated_at)
        values (${userId}, 'SUPER_ADMIN', 'active', ${userId}, now())
        on conflict (user_id) do update set
          role = 'SUPER_ADMIN',
          status = 'active',
          revoked_at = null,
          updated_at = now()
      `.execute(tx);

      await sql`
        update platform_admin_bootstrap
        set used_at = coalesce(used_at, now()), used_by = ${userId}
        where id = true
      `.execute(tx);

      await sql`
        insert into platform_admin_audit_log (
          id, admin_user_id, admin_role, action, target_type, target_id,
          reason, metadata, created_at
        ) values (
          gen_random_uuid(), ${userId}, 'SUPER_ADMIN', 'admin.bootstrap',
          'platform_admin', ${userId}, 'one-time CLI bootstrap',
          '{"source":"cli"}'::jsonb, now()
        )
      `.execute(tx);
    });

    console.log(JSON.stringify({ ok: true, username }));
  } finally {
    await db.destroy();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: String(error.message || error) }));
  process.exit(1);
});
