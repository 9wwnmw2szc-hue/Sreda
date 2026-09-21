export const dynamic = "force-dynamic";

/**
 * Process liveness — no dependency checks.
 * Use for orchestrator liveness probes; readiness is /api/health/web (db) or /api/health (workers).
 * Never exposes secrets.
 */
export async function GET() {
  return Response.json(
    { ok: true, checks: { live: "ok" } },
    { headers: { "Cache-Control": "no-store" } },
  );
}
