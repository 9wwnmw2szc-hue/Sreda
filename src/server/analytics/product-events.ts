import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import { log } from "../observability/log.ts";

export const PRODUCT_EVENTS = [
  "registration_completed",
  "business_created",
  "solution_activated",
  "channel_connected",
  "first_order",
  "first_lead",
  "first_booking",
  "first_reply",
  "setup_completed",
] as const;

export type ProductEventName = (typeof PRODUCT_EVENTS)[number];

const SECRETISH =
  /pass(word)?|secret|token|phone|email|message|prompt|authorization/i;

/** Privacy-conscious product analytics — never store message text / PII / secrets. */
export async function trackProductEvent(
  db: Kysely<Database>,
  input: {
    event: ProductEventName | string;
    businessId?: string | null;
    userId?: string | null;
    meta?: Record<string, string | number | boolean | null>;
  },
): Promise<void> {
  const event = String(input.event || "").slice(0, 64);
  if (!event) return;
  const meta: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(input.meta ?? {})) {
    if (SECRETISH.test(key)) continue;
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      meta[key.slice(0, 40)] =
        typeof value === "string" ? value.slice(0, 120) : value;
    }
  }
  try {
    await db
      .insertInto("product_event")
      .values({
        id: randomUUID(),
        business_id: input.businessId ?? null,
        user_id: input.userId ?? null,
        event,
        meta: JSON.stringify(meta),
      })
      .execute();
  } catch (error) {
    log("info", "product_event_record_failed", {
      event,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}
