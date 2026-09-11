import "server-only";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { Database } from "./db/schema";
import { runtimeConfig } from "./identity/config";
import { createIdentity } from "./identity/auth";
import { sendCode } from "./identity/mail";
import { WorkspaceService } from "./workspaces/service";

function initialize() {
  const config = runtimeConfig();
  const db = new Kysely<Database>({ dialect: new PostgresDialect({
    pool: new Pool({ connectionString: config.databaseUrl, max: 10,
      connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000 }),
  }) });
  return { ...config, db, auth: createIdentity({ ...config, db, sendCode }),
    workspaces: new WorkspaceService(db) };
}
const state = globalThis as typeof globalThis & { sredaRuntime?: ReturnType<typeof initialize> };
export function getRuntime() {
  return state.sredaRuntime ??= initialize();
}
