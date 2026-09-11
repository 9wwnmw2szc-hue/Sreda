import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { sql, type Kysely } from "kysely";

/** Reviewed, immutable SQL files only. Never migrate implicitly on a web request. */
export async function migrate(db: Kysely<unknown>, directory: string) {
  await db.transaction().execute(async (tx) => {
    await sql`select pg_advisory_xact_lock(749362801)`.execute(tx);
    await sql`create table if not exists sreda_migration (
      name text primary key, checksum text not null, applied_at timestamptz not null default now()
    )`.execute(tx);
    for (const name of (await readdir(directory)).filter((name) => /^\d+_[\w-]+\.sql$/.test(name)).sort()) {
      const content = await readFile(directory + "/" + name, "utf8");
      const checksum = createHash("sha256").update(content).digest("hex");
      const existing = await sql<{ checksum: string }>`select checksum from sreda_migration where name = ${name}`.execute(tx);
      if (existing.rows.length) {
        if (existing.rows[0]!.checksum !== checksum) throw new Error("Previously applied migration changed: " + name);
        continue;
      }
      // These migrations contain ordinary DDL, no procedural bodies or quoted semicolons.
      for (const statement of content.split(";").map((value) => value.trim()).filter(Boolean)) {
        await sql.raw(statement).execute(tx);
      }
      await sql`insert into sreda_migration (name, checksum) values (${name}, ${checksum})`.execute(tx);
    }
  });
}
