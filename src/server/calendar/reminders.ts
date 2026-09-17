import { randomUUID } from "node:crypto";
import { sql, type Transaction } from "kysely";
import type { Database } from "../db/schema.ts";
import { AppError } from "../http/errors.ts";
import type {
  EntityReminderAudience,
  EntityReminderChannel,
  EntityReminderKind,
} from "./schema.ts";

const fail = (message = "Проверьте параметры напоминания.") =>
  new AppError(400, "INVALID_REMINDER", message);

export function parseOffsets(raw: unknown, fallback: number[] = []): number[] {
  let source: unknown = raw == null ? fallback : raw;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      throw fail();
    }
  }
  if (!Array.isArray(source) || source.length > 20) throw fail();
  const offsets = source.map((value) => {
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > 10080
    )
      throw fail("Смещение напоминания должно быть от 0 до 10080 минут.");
    return value;
  });
  return [...new Set(offsets)].sort((a, b) => b - a);
}

export async function cancelReminders(
  tx: Transaction<Database>,
  businessId: string,
  entityKind: EntityReminderKind,
  entityId: string,
) {
  await tx
    .updateTable("entity_reminder")
    .set({ status: "cancelled" })
    .where("business_id", "=", businessId)
    .where("entity_kind", "=", entityKind)
    .where("entity_id", "=", entityId)
    .where("status", "in", ["pending", "queued"])
    .execute();
}

export async function scheduleReminders(
  tx: Transaction<Database>,
  input: {
    businessId: string;
    entityKind: EntityReminderKind;
    entityId: string;
    startsAt: Date;
    offsets: number[];
    audience?: EntityReminderAudience;
    channel?: EntityReminderChannel;
    recipientUserId?: string | null;
    messageTemplate?: string;
    replace?: boolean;
  },
) {
  const audience = input.audience ?? "staff";
  const channel = input.channel ?? "in_app";
  const template = input.messageTemplate ?? "";
  if (template.length > 2000) throw fail("Шаблон слишком длинный.");
  const offsets = parseOffsets(input.offsets);
  if (input.replace !== false)
    await cancelReminders(
      tx,
      input.businessId,
      input.entityKind,
      input.entityId,
    );
  for (const offset of offsets) {
    const fireAt = new Date(+input.startsAt - offset * 60000);
    if (+fireAt <= Date.now()) continue;
    const id = randomUUID();
    await sql`
      INSERT INTO entity_reminder (
        id, business_id, entity_kind, entity_id, offset_minutes, fire_at,
        audience, channel, status, recipient_user_id, message_template, last_error
      ) VALUES (
        ${id}::uuid,
        ${input.businessId}::uuid,
        ${input.entityKind},
        ${input.entityId}::uuid,
        ${offset},
        ${fireAt},
        ${audience},
        ${channel},
        'pending',
        ${input.recipientUserId ?? null},
        ${template},
        NULL
      )
      ON CONFLICT (
        business_id, entity_kind, entity_id, offset_minutes, audience, channel,
        (COALESCE(recipient_user_id, '00000000-0000-0000-0000-000000000000'::uuid))
      )
      DO UPDATE SET
        fire_at = EXCLUDED.fire_at,
        status = 'pending',
        message_template = EXCLUDED.message_template,
        last_error = NULL
    `.execute(tx);
  }
}
