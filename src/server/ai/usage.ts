import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import { AppError } from "../http/errors.ts";
import { log } from "../observability/log.ts";

export type AiUsageInput = {
  businessId: string;
  feature: string;
  model?: string;
  requestCount?: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
  estimatedCostMinor?: number | null;
  currency?: string;
};

/** Never store prompt/completion text — metrics only. */
export async function recordAiUsage(
  db: Kysely<Database>,
  input: AiUsageInput,
): Promise<void> {
  const feature = String(input.feature || "").slice(0, 64);
  if (!feature || !input.businessId) return;
  try {
    await db
      .insertInto("ai_usage_event")
      .values({
        business_id: input.businessId,
        feature,
        model: String(input.model || "").slice(0, 120),
        request_count: Math.max(1, Number(input.requestCount) || 1),
        input_tokens: input.inputTokens ?? null,
        output_tokens: input.outputTokens ?? null,
        estimated_cost_minor: input.estimatedCostMinor ?? null,
        currency: /^[A-Z]{3}$/.test(String(input.currency || ""))
          ? String(input.currency)
          : "RUB",
      })
      .execute();
  } catch (error) {
    log("info", "ai_usage_record_failed", {
      businessId: input.businessId,
      feature,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}

export function aiDailyRequestLimit(): number {
  const raw = Number(process.env.AI_DAILY_REQUEST_LIMIT || 500);
  return Number.isFinite(raw) && raw > 0 ? raw : 500;
}

export async function assertAiUsageAllowed(
  db: Kysely<Database>,
  businessId: string,
): Promise<void> {
  const limit = aiDailyRequestLimit();
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  try {
    const row = await db
      .selectFrom("ai_usage_event")
      .select((eb) => eb.fn.sum<number>("request_count").as("total"))
      .where("business_id", "=", businessId)
      .where("created_at", ">=", start)
      .executeTakeFirst();
    const total = Number(
      (row as { total?: number | string } | undefined)?.total || 0,
    );
    if (total >= limit) {
      throw new AppError(
        429,
        "AI_LIMIT",
        "Дневной лимит AI-запросов исчерпан. Попробуйте завтра или обратитесь в поддержку.",
      );
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    // Table may be missing mid-migration in older envs — fail open for readiness.
  }
}
