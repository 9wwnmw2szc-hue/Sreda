import { randomUUID } from "node:crypto";
import type { Kysely, Transaction } from "kysely";
import type { Database } from "../db/schema.ts";
import type { PlatformAdminRole } from "./permissions.ts";

const SECRET_KEYS =
  /token|secret|password|credential|authorization|api[_-]?key|private|cookie|session/i;

/** Strip secret-like keys from audit metadata before persistence. */
export function sanitizeAdminMetadata(
  metadata: Record<string, unknown> = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (SECRET_KEYS.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = sanitizeAdminMetadata(value as Record<string, unknown>);
      continue;
    }
    if (typeof value === "string" && value.length > 500) {
      out[key] = value.slice(0, 500) + "…";
      continue;
    }
    out[key] = value;
  }
  return out;
}

export async function writePlatformAudit(
  db: Kysely<Database> | Transaction<Database>,
  input: {
    adminUserId: string;
    adminRole: PlatformAdminRole;
    action: string;
    targetType: string;
    targetId?: string | null;
    businessId?: string | null;
    reason?: string | null;
    metadata?: Record<string, unknown>;
    requestId?: string | null;
  },
) {
  await db
    .insertInto("platform_admin_audit_log")
    .values({
      id: randomUUID(),
      admin_user_id: input.adminUserId,
      admin_role: input.adminRole,
      action: input.action,
      target_type: input.targetType,
      target_id: input.targetId ?? null,
      business_id: input.businessId ?? null,
      reason: input.reason ?? null,
      metadata: sanitizeAdminMetadata(input.metadata ?? {}),
      request_id: input.requestId ?? null,
    })
    .execute();
}
