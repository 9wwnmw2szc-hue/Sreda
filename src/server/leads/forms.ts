import { randomUUID } from "node:crypto";
import type { Kysely, Transaction } from "kysely";
import type { Database } from "../db/schema.ts";
import { AppError } from "../http/errors.ts";
import { requireBusiness } from "../access/permissions.ts";
import {
  LEAD_FIELDS,
  type LeadFieldId,
  type LeadSetupDraft,
} from "../../lib/leadSetupDraft.ts";

const FIELD_TYPES = [
  "text",
  "textarea",
  "phone",
  "email",
  "number",
  "select",
  "multiselect",
  "date",
  "checkbox",
  "attachment",
  "name",
  "message",
  "address",
  "budget",
  "service",
] as const;

type FieldType = (typeof FIELD_TYPES)[number];

const SETUP_TYPE: Record<LeadFieldId, FieldType> = {
  name: "name",
  phone: "phone",
  email: "email",
  message: "message",
  service: "service",
  comment: "textarea",
};

const fail = (message = "Проверьте поле формы.") =>
  new AppError(400, "INVALID_LEAD_FIELD", message);

function fieldKey(value: unknown) {
  if (typeof value !== "string") throw fail();
  const key = value.trim();
  if (key.length < 1 || key.length > 64) throw fail("Укажите ключ поля.");
  if (!/^[a-z][a-z0-9_]{0,63}$/i.test(key))
    throw fail("Ключ поля: латиница, цифры и подчёркивание.");
  return key;
}

function label(value: unknown) {
  if (typeof value !== "string") throw fail();
  const text = value.trim();
  if (text.length < 1 || text.length > 120) throw fail("Укажите название поля.");
  return text;
}

function fieldType(value: unknown): FieldType {
  if (typeof value !== "string" || !FIELD_TYPES.includes(value as FieldType))
    throw fail("Неизвестный тип поля.");
  return value as FieldType;
}

function placeholder(value: unknown) {
  if (value == null || value === "") return "";
  if (typeof value !== "string" || value.length > 200)
    throw fail("Слишком длинная подсказка.");
  return value;
}

function options(value: unknown) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 50) throw fail();
  return value.map((item) => {
    if (typeof item === "string") {
      const text = item.trim();
      if (!text || text.length > 120) throw fail();
      return text;
    }
    if (
      item &&
      typeof item === "object" &&
      typeof (item as { label?: unknown }).label === "string"
    ) {
      const text = String((item as { label: string }).label).trim();
      if (!text || text.length > 120) throw fail();
      return {
        label: text,
        value:
          typeof (item as { value?: unknown }).value === "string"
            ? String((item as { value: string }).value).slice(0, 120)
            : text,
      };
    }
    throw fail();
  });
}

function toField(row: {
  id: string;
  business_id: string;
  field_key: string;
  label: string;
  field_type: string;
  required: boolean;
  placeholder: string;
  options: unknown;
  position: number;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id: row.id,
    businessId: row.business_id,
    fieldKey: row.field_key,
    label: row.label,
    fieldType: row.field_type,
    required: row.required,
    placeholder: row.placeholder,
    options: row.options,
    position: row.position,
    active: row.active,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function syncLeadFormFields(
  tx: Transaction<Database>,
  businessId: string,
  draft: LeadSetupDraft,
) {
  const now = new Date();
  const selected = LEAD_FIELDS.filter((f) => draft.fields.includes(f.id));
  const keys = selected.map((f) => f.id);
  const existing = await tx
    .selectFrom("lead_form_field")
    .selectAll()
    .where("business_id", "=", businessId)
    .execute();
  const byKey = new Map(existing.map((row) => [row.field_key, row]));
  for (const [position, field] of selected.entries()) {
    const option = draft.fieldOptions?.[field.id];
    const values = {
      label: option?.label?.trim() || field.label,
      field_type: SETUP_TYPE[field.id],
      required: field.id === "name" || Boolean(option?.required ?? field.required),
      placeholder: field.example,
      options: JSON.stringify([]),
      position,
      active: true,
      updated_at: now,
    };
    const current = byKey.get(field.id);
    if (current) {
      await tx
        .updateTable("lead_form_field")
        .set(values)
        .where("business_id", "=", businessId)
        .where("id", "=", current.id)
        .execute();
    } else {
      await tx
        .insertInto("lead_form_field")
        .values({
          id: randomUUID(),
          business_id: businessId,
          field_key: field.id,
          ...values,
        })
        .execute();
    }
  }
  for (const row of existing) {
    if (!keys.includes(row.field_key as LeadFieldId) && row.active) {
      await tx
        .updateTable("lead_form_field")
        .set({ active: false, updated_at: now })
        .where("business_id", "=", businessId)
        .where("id", "=", row.id)
        .execute();
    }
  }
}

export class LeadFormService {
  constructor(private readonly db: Kysely<Database>) {}

  async list(userId: string, publicId: string, activeOnly = false) {
    const b = await requireBusiness(this.db, userId, publicId, "leads.write");
    let query = this.db
      .selectFrom("lead_form_field")
      .selectAll()
      .where("business_id", "=", b.id)
      .orderBy("position")
      .orderBy("created_at");
    if (activeOnly) query = query.where("active", "=", true);
    return (await query.execute()).map(toField);
  }

  async save(
    userId: string,
    publicId: string,
    body: Record<string, unknown>,
    fieldId?: string,
  ) {
    return this.db.transaction().execute(async (tx) => {
      const b = await requireBusiness(tx, userId, publicId, "solutions.manage");
      await tx
        .selectFrom("business")
        .select("id")
        .where("id", "=", b.id)
        .forUpdate()
        .execute();
      await requireBusiness(tx, userId, publicId, "solutions.manage");
      const key = fieldKey(body.fieldKey ?? body.field_key);
      const values = {
        field_key: key,
        label: label(body.label),
        field_type: fieldType(body.fieldType ?? body.field_type),
        required: body.required === true,
        placeholder: placeholder(body.placeholder),
        options: JSON.stringify(options(body.options)),
        position:
          typeof body.position === "number" &&
          Number.isInteger(body.position) &&
          body.position >= 0 &&
          body.position <= 1000
            ? body.position
            : 0,
        active: body.active !== false,
        updated_at: new Date(),
      };
      if (fieldId) {
        if (
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            fieldId,
          )
        )
          throw new AppError(404, "LEAD_FIELD_NOT_FOUND", "Поле не найдено.");
        const changed = await tx
          .updateTable("lead_form_field")
          .set(values)
          .where("business_id", "=", b.id)
          .where("id", "=", fieldId)
          .returningAll()
          .executeTakeFirst();
        if (!changed)
          throw new AppError(404, "LEAD_FIELD_NOT_FOUND", "Поле не найдено.");
        return toField(changed);
      }
      try {
        const row = await tx
          .insertInto("lead_form_field")
          .values({
            id: randomUUID(),
            business_id: b.id,
            ...values,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        return toField(row);
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          (error as { code?: string }).code === "23505"
        )
          throw fail("Поле с таким ключом уже есть.");
        throw error;
      }
    });
  }

  async remove(userId: string, publicId: string, fieldId: string) {
    return this.db.transaction().execute(async (tx) => {
      const b = await requireBusiness(tx, userId, publicId, "solutions.manage");
      await tx
        .selectFrom("business")
        .select("id")
        .where("id", "=", b.id)
        .forUpdate()
        .execute();
      await requireBusiness(tx, userId, publicId, "solutions.manage");
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          fieldId,
        )
      )
        throw new AppError(404, "LEAD_FIELD_NOT_FOUND", "Поле не найдено.");
      const changed = await tx
        .updateTable("lead_form_field")
        .set({ active: false, updated_at: new Date() })
        .where("business_id", "=", b.id)
        .where("id", "=", fieldId)
        .returning("id")
        .executeTakeFirst();
      if (!changed)
        throw new AppError(404, "LEAD_FIELD_NOT_FOUND", "Поле не найдено.");
      return { ok: true };
    });
  }
}
