import { audit } from "../audit/service.ts";
import { nextOccurrence, type Recurrence } from "../posts/recurrence.ts";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import { requireBusiness } from "../access/permissions.ts";
import { parseBusiness } from "./validation.ts";
import { AppError } from "../http/errors.ts";

const AI_FIELD_LIMITS = {
  ai_about: 8000,
  ai_tone: 1000,
  ai_important_facts: 4000,
  ai_restrictions: 4000,
  ai_delivery_info: 2000,
  ai_geography: 2000,
  ai_returns_info: 2000,
  ai_extra_instructions: 4000,
} as const;

type AiField = keyof typeof AI_FIELD_LIMITS;

export class BusinessProfileService {
  constructor(private db: Kysely<Database>) {}
  async get(userId: string, publicId: string) {
    const b = await requireBusiness(this.db, userId, publicId, "clients.read");
    return this.db
      .selectFrom("business")
      .select([
        "name",
        "public_name",
        "greeting",
        "description",
        "contact_info",
        "timezone",
        "business_type",
        "ai_about",
        "ai_tone",
        "ai_important_facts",
        "ai_restrictions",
        "ai_delivery_info",
        "ai_geography",
        "ai_returns_info",
        "ai_extra_instructions",
      ])
      .where("id", "=", b.id)
      .executeTakeFirstOrThrow();
  }
  async save(userId: string, publicId: string, input: Record<string, unknown>) {
    const base = parseBusiness({
      name: input.name,
      timezone: input.timezone,
      business_type: input.business_type,
    });
    const optional = (key: string, max: number) => {
      const value = input[key] ?? "";
      if (
        typeof value !== "string" ||
        value.length > max ||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
      )
        throw new AppError(400, "INVALID_PROFILE", "Проверьте поля профиля.");
      return value.trim();
    };
    const aiFields = Object.fromEntries(
      (Object.keys(AI_FIELD_LIMITS) as AiField[]).map((key) => [
        key,
        optional(key, AI_FIELD_LIMITS[key]),
      ]),
    ) as Record<AiField, string>;
    const fields = {
      ...base,
      public_name: optional("public_name", 100) || null,
      greeting: optional("greeting", 2000),
      description: optional("description", 4000),
      contact_info: optional("contact_info", 2000),
      ...aiFields,
    };
    return this.db.transaction().execute(async (tx) => {
      const b = await requireBusiness(tx, userId, publicId, "settings.manage");
      await tx
        .selectFrom("business")
        .select("id")
        .where("id", "=", b.id)
        .forUpdate()
        .execute();
      await requireBusiness(tx, userId, publicId, "settings.manage");
      const old = await tx
        .selectFrom("business")
        .select("timezone")
        .where("id", "=", b.id)
        .executeTakeFirstOrThrow();
      await tx
        .updateTable("business")
        .set(fields)
        .where("id", "=", b.id)
        .execute();
      if (old.timezone !== fields.timezone) {
        const schedules = await tx
          .selectFrom("post_schedule")
          .selectAll()
          .where("business_id", "=", b.id)
          .where("active", "=", true)
          .execute();
        for (const schedule of schedules) {
          const rule = {
            ...(schedule.rule as Recurrence),
            timezone: fields.timezone,
          };
          const next = nextOccurrence(rule, new Date());
          await tx
            .updateTable("post_schedule")
            .set({
              rule: JSON.stringify(rule),
              next_at: next,
              active: !!next,
              revision: schedule.revision + 1,
            })
            .where("post_id", "=", schedule.post_id)
            .execute();
          await tx
            .updateTable("post")
            .set({ status: "cancelled" })
            .where("template_id", "=", schedule.post_id)
            .where("status", "=", "scheduled")
            .execute();
        }
      }
      await audit(tx, b.id, userId, "settings_changed", b.id, {
        fields: Object.keys(fields),
      });
      return fields;
    });
  }
}
