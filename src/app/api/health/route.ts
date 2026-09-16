import { sql } from "kysely";
import { getRuntime } from "@/server/runtime";
export const dynamic = "force-dynamic";
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
      .selectFrom("business_solution")
      .select("solution_code")
      .where("status", "in", ["active", "trial"])
      .execute();
    if (active.some((s) => s.solution_code === "booking"))
      required.push("booking_reminders");
    if (active.some((s) => s.solution_code === "autopost"))
      required.push("autopost");
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
