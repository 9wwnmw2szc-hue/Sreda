import { sql } from "kysely";
import { getRuntime } from "@/server/runtime";

export const dynamic = "force-dynamic";

/**
 * Full dependency readiness (deploy / ops gate).
 * Checks web process, database, and required worker heartbeats
 * (telegram/vk/autopost/booking_reminders write `worker_heartbeat` while looping).
 * Never returns secrets or connection strings — only ok / unavailable / disabled.
 * For process-only liveness use /api/health/live; for web+db deploy gate use /api/health/web.
 */
export async function GET() {
  const checks: Record<string, string> = { web: "ok", database: "unavailable" };
  try {
    const r = getRuntime();
    await sql`select 1`.execute(r.db);
    checks.database = "ok";
    const required = [
      ...(r.telegramEnabled ? ["telegram"] : []),
      ...(r.vkEnabled ? ["vk"] : []),
    ];
    const active = await r.db
      .selectFrom("business_solution as s")
      .innerJoin("business as b", "b.id", "s.business_id")
      .select("s.solution_code")
      .where("b.archived_at", "is", null)
      .where("s.status", "in", ["active", "trial"])
      .where((eb) =>
        eb.or([
          eb("s.expires_at", "is", null),
          eb("s.expires_at", ">", new Date()),
        ]),
      )
      .execute();
    if (active.some((s) => s.solution_code === "booking"))
      required.push("booking_reminders");
    if (active.some((s) => s.solution_code === "autopost"))
      required.push("autopost");
    // Workers upsert heartbeat ~every loop; stale (>60s) means unavailable.
    const beats = await r.db
      .selectFrom("worker_heartbeat")
      .selectAll()
      .execute();
    for (const name of ["telegram", "vk", "autopost", "booking_reminders"])
      checks[name] = required.includes(name)
        ? beats.some((b) => b.name === name && +b.seen_at > Date.now() - 60000)
          ? "ok"
          : "unavailable"
        : "disabled";
    const ok = !Object.values(checks).includes("unavailable");
    return Response.json(
      { ok, checks },
      { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { ok: false, checks },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
