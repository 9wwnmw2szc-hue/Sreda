import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { migrate } from "../src/server/db/migrate.ts";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const db = new Kysely({ dialect: new PostgresDialect({
  pool: new Pool({ connectionString: process.env.DATABASE_URL, max: 1 }),
}) });
try {
  await migrate(db, new URL("../migrations", import.meta.url).pathname);
  console.log("Migrations applied.");
} finally { await db.destroy(); }
