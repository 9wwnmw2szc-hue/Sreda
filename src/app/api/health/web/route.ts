import { sql } from "kysely";
import { getRuntime } from "@/server/runtime";
export const dynamic = "force-dynamic";
/** Deployment gate for web/database only. /api/health remains full worker readiness. */
export async function GET() {
  try {
    await sql`select 1`.execute(getRuntime().db);
    return Response.json(
      { ok: true, checks: { web: "ok", database: "ok" } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { ok: false, checks: { web: "ok", database: "unavailable" } },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
