import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import { requireBusiness } from "../access/permissions.ts";
import { AppError } from "../http/errors.ts";
import { audit } from "../audit/service.ts";
import { clientInput, normalizeIdentity } from "../clients/service.ts";

export type ImportEntity = "clients" | "products";

export type MappedRow = Record<string, string | null | undefined>;

export type ImportPreviewRow = {
  index: number;
  status: "ok" | "error" | "duplicate";
  message?: string;
  data?: Record<string, string>;
};

export type ImportReport = {
  entity: ImportEntity;
  ready: number;
  errors: number;
  duplicates: number;
  imported: number;
  skipped: number;
  rows: ImportPreviewRow[];
};

function cell(row: MappedRow, key: string): string {
  const v = row[key];
  return v == null ? "" : String(v).trim();
}

function sanitizeFormula(value: string): string {
  if (/^[=+\-@]/.test(value)) return "'" + value;
  return value;
}

export function previewClientRows(rows: MappedRow[]): ImportPreviewRow[] {
  const seenPhone = new Set<string>();
  return rows.map((row, index): ImportPreviewRow => {
    try {
      const input = clientInput({
        name: cell(row, "name") || cell(row, "имя"),
        phone: cell(row, "phone") || cell(row, "телефон") || undefined,
        email: cell(row, "email") || undefined,
      });
      if (input.phone && seenPhone.has(input.phone)) {
        return {
          index,
          status: "duplicate",
          message: "Дубликат телефона в файле",
          data: { name: input.name, phone: input.phone },
        };
      }
      if (input.phone) seenPhone.add(input.phone);
      return {
        index,
        status: "ok",
        data: {
          name: input.name,
          phone: input.phone ?? "",
          email: input.email ?? "",
        },
      };
    } catch (error) {
      return {
        index,
        status: "error",
        message: error instanceof AppError ? error.message : "Строка повреждена",
      };
    }
  });
}

export function previewProductRows(rows: MappedRow[]): ImportPreviewRow[] {
  const seenSku = new Set<string>();
  return rows.map((row, index): ImportPreviewRow => {
    const name = sanitizeFormula(
      cell(row, "name") || cell(row, "название") || cell(row, "товар"),
    );
    const priceRaw = cell(row, "price") || cell(row, "цена") || "0";
    const sku = sanitizeFormula(cell(row, "sku") || cell(row, "артикул"));
    const currency = (
      cell(row, "currency") ||
      cell(row, "валюта") ||
      "RUB"
    ).toUpperCase();
    if (!name || name.length > 200) {
      return {
        index,
        status: "error",
        message: "Укажите название товара до 200 символов",
      };
    }
    const price = Number(String(priceRaw).replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(price) || price < 0 || price > 1_000_000_000) {
      return { index, status: "error", message: "Некорректная цена" };
    }
    if (!/^[A-Z]{3}$/.test(currency)) {
      return { index, status: "error", message: "Валюта должна быть ISO-4217" };
    }
    if (sku && seenSku.has(sku)) {
      return {
        index,
        status: "duplicate",
        message: "Дубликат SKU в файле",
        data: { name, price: price.toFixed(2), currency, sku },
      };
    }
    if (sku) seenSku.add(sku);
    return {
      index,
      status: "ok",
      data: {
        name,
        price: price.toFixed(2),
        currency,
        sku,
        description: sanitizeFormula(
          cell(row, "description") || cell(row, "описание"),
        ).slice(0, 2000),
      },
    };
  });
}

function summarize(entity: ImportEntity, rows: ImportPreviewRow[]): ImportReport {
  return {
    entity,
    ready: rows.filter((r) => r.status === "ok").length,
    errors: rows.filter((r) => r.status === "error").length,
    duplicates: rows.filter((r) => r.status === "duplicate").length,
    imported: 0,
    skipped: 0,
    rows,
  };
}

export class EntityImportService {
  constructor(private db: Kysely<Database>) {}

  preview(entity: ImportEntity, rows: MappedRow[]): ImportReport {
    if (!Array.isArray(rows) || rows.length === 0)
      throw new AppError(400, "EMPTY_IMPORT", "Нет строк для импорта.");
    if (rows.length > 5000)
      throw new AppError(
        400,
        "IMPORT_TOO_LARGE",
        "За один раз можно импортировать до 5000 строк.",
      );
    const preview =
      entity === "clients" ? previewClientRows(rows) : previewProductRows(rows);
    return summarize(entity, preview);
  }

  async commit(
    userId: string,
    publicId: string,
    entity: ImportEntity,
    rows: MappedRow[],
  ): Promise<ImportReport> {
    const b = await requireBusiness(
      this.db,
      userId,
      publicId,
      entity === "clients" ? "clients.write" : "orders.write",
    );
    const report = this.preview(entity, rows);
    let imported = 0;
    let skipped = 0;

    await this.db.transaction().execute(async (tx) => {
      for (const row of report.rows) {
        if (row.status !== "ok" || !row.data) {
          skipped += 1;
          continue;
        }
        const data = row.data;
        if (entity === "clients") {
          const phone = data.phone || null;
          if (phone) {
            const existing = await tx
              .selectFrom("client")
              .select("id")
              .where("business_id", "=", b.id)
              .where("phone", "=", phone)
              .executeTakeFirst();
            if (existing) {
              row.status = "duplicate";
              row.message = "Клиент с таким телефоном уже есть";
              skipped += 1;
              continue;
            }
          }
          const id = randomUUID();
          await tx
            .insertInto("client")
            .values({
              id,
              business_id: b.id,
              name: String(data.name ?? ""),
              phone,
              email: data.email ? String(data.email) : null,
            })
            .execute();
          if (phone) {
            const identity = normalizeIdentity({ kind: "phone", value: phone });
            await tx
              .insertInto("client_identity")
              .values({
                business_id: b.id,
                client_id: id,
                kind: identity.kind,
                value: identity.value,
                username: null,
              })
              .execute();
          }
          imported += 1;
        } else {
          const sku = data.sku || null;
          if (sku) {
            const existing = await tx
              .selectFrom("product")
              .select("id")
              .where("business_id", "=", b.id)
              .where("sku", "=", sku)
              .executeTakeFirst();
            if (existing) {
              row.status = "duplicate";
              row.message = "Товар с таким SKU уже есть";
              skipped += 1;
              continue;
            }
          }
          await tx
            .insertInto("product")
            .values({
              id: randomUUID(),
              business_id: b.id,
              category_id: null,
              name: String(data.name ?? ""),
              description: String(data.description ?? ""),
              price: String(data.price ?? "0"),
              compare_at_price: null,
              currency: String(data.currency ?? "RUB"),
              sku,
              active: true,
              track_inventory: false,
              availability: "in_stock",
              use_variants: false,
              variant_prices_enabled: false,
              stock_quantity: null,
              low_stock_threshold: null,
              updated_at: new Date(),
            })
            .execute();
          imported += 1;
        }
      }
      await audit(tx, b.id, userId, "data_import_committed", b.id, {
        entity,
        imported,
        skipped,
        errors: report.errors,
        duplicates: report.duplicates,
      });
    });

    return {
      ...report,
      imported,
      skipped,
      ready: report.rows.filter((r) => r.status === "ok").length,
      duplicates: report.rows.filter((r) => r.status === "duplicate").length,
      errors: report.rows.filter((r) => r.status === "error").length,
    };
  }
}
