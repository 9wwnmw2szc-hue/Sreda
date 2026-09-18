import ExcelJS from "exceljs";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import { requireBusiness } from "../access/permissions.ts";
import { AppError } from "../http/errors.ts";
import { audit } from "../audit/service.ts";
import { resolvePeriod, type PeriodPreset } from "./periods.ts";
import { escapeSpreadsheetCell, toCsv } from "./format.ts";

export type ExportEntity =
  | "orders"
  | "leads"
  | "bookings"
  | "clients"
  | "products";

export type ExportFormat = "csv" | "xlsx";

export class AnalyticsExportService {
  constructor(private db: Kysely<Database>) {}

  async export(
    userId: string,
    publicId: string,
    entity: ExportEntity,
    format: ExportFormat,
    preset: PeriodPreset = "30d",
    custom?: { from: string; until: string },
  ) {
    const permission =
      entity === "clients" ? "analytics.export" : "analytics.export";
    // clients always need export permission; all exports use analytics.export
    const b = await requireBusiness(this.db, userId, publicId, permission);
    if (entity === "clients" && b.role === "operator")
      throw new AppError(
        403,
        "FORBIDDEN",
        "Выгрузка клиентской базы доступна владельцу и администратору.",
      );

    const biz = await this.db
      .selectFrom("business")
      .select(["id", "timezone"])
      .where("id", "=", b.id)
      .executeTakeFirstOrThrow();
    const range = resolvePeriod(preset, biz.timezone, new Date(), custom);
    const table = await this.buildRows(b.id, entity, range.from, range.until);

    let bytes: Uint8Array;
    let mime: string;
    let filename: string;
    if (format === "csv") {
      bytes = Buffer.from(toCsv(table), "utf8");
      mime = "text/csv; charset=utf-8";
      filename = `${entity}-${range.label.replace(/\s/g, "")}.csv`;
    } else {
      bytes = await this.toXlsx(table, entity);
      mime =
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      filename = `${entity}-${range.label.replace(/\s/g, "")}.xlsx`;
    }

    await this.db.transaction().execute(async (tx) => {
      await audit(tx, b.id, userId, "analytics_export_created", b.id, {
        entity,
        format,
        rows: Math.max(0, table.length - 1),
      });
    });

    return { bytes, mime, filename };
  }

  private async buildRows(
    businessId: string,
    entity: ExportEntity,
    from: Date,
    until: Date,
  ): Promise<string[][]> {
    switch (entity) {
      case "orders": {
        const rows = await this.db
          .selectFrom("order")
          .select([
            "id",
            "created_at",
            "customer_name",
            "source",
            "status",
            "total",
            "currency",
            "fulfillment",
            "comment",
          ])
          .where("business_id", "=", businessId)
          .where("created_at", ">=", from)
          .where("created_at", "<", until)
          .orderBy("created_at", "asc")
          .execute();
        const items = await this.db
          .selectFrom("order_item")
          .select(["order_id"])
          .where("business_id", "=", businessId)
          .execute();
        const counts = new Map<string, number>();
        for (const item of items)
          counts.set(item.order_id, (counts.get(item.order_id) ?? 0) + 1);
        return [
          [
            "Номер заказа",
            "Дата",
            "Клиент",
            "Канал",
            "Статус",
            "Количество позиций",
            "Сумма",
            "Валюта",
            "Получение",
            "Комментарий",
          ],
          ...rows.map((r) => [
            r.id.slice(0, 8),
            new Date(r.created_at).toISOString(),
            r.customer_name,
            r.source,
            r.status,
            String(counts.get(r.id) ?? 0),
            String(r.total),
            r.currency,
            r.fulfillment,
            r.comment ?? "",
          ]),
        ];
      }
      case "leads": {
        const rows = await this.db
          .selectFrom("lead")
          .select([
            "id",
            "created_at",
            "name",
            "source",
            "status",
            "processing_by",
            "answers",
            "message",
          ])
          .where("business_id", "=", businessId)
          .where("created_at", ">=", from)
          .where("created_at", "<", until)
          .orderBy("created_at", "asc")
          .execute();
        return [
          [
            "ID заявки",
            "Дата",
            "Клиент",
            "Источник",
            "Статус",
            "В работе",
            "Поля",
            "Комментарий",
          ],
          ...rows.map((r) => [
            r.id.slice(0, 8),
            new Date(r.created_at).toISOString(),
            r.name ?? "",
            r.source,
            r.status,
            r.processing_by ?? "",
            typeof r.answers === "string"
              ? r.answers
              : JSON.stringify(r.answers ?? {}),
            r.message ?? "",
          ]),
        ];
      }
      case "bookings": {
        const rows = await this.db
          .selectFrom("booking as b")
          .leftJoin("booking_service as s", "s.id", "b.service_id")
          .leftJoin("booking_specialist as sp", "sp.id", "b.specialist_id")
          .leftJoin("client as c", "c.id", "b.client_id")
          .select([
            "b.created_at",
            "b.starts_at",
            "b.ends_at",
            "b.status",
            "b.source",
            "c.name as client_name",
            "s.name as service_name",
            "sp.name as specialist_name",
          ])
          .where("b.business_id", "=", businessId)
          .where("b.starts_at", ">=", from)
          .where("b.starts_at", "<", until)
          .orderBy("b.starts_at", "asc")
          .execute();
        return [
          [
            "Дата создания",
            "Дата записи",
            "Время",
            "Клиент",
            "Услуга",
            "Специалист",
            "Длительность",
            "Статус",
            "Канал",
          ],
          ...rows.map((r) => {
            const start = new Date(r.starts_at);
            const end = new Date(r.ends_at);
            const mins = Math.round((+end - +start) / 60000);
            return [
              new Date(r.created_at).toISOString(),
              start.toISOString().slice(0, 10),
              start.toISOString().slice(11, 16),
              r.client_name ?? "",
              r.service_name ?? "",
              r.specialist_name ?? "",
              String(mins),
              r.status,
              r.source,
            ];
          }),
        ];
      }
      case "clients": {
        const rows = await this.db
          .selectFrom("client")
          .select(["id", "name", "phone", "email", "created_at", "last_seen_at"])
          .where("business_id", "=", businessId)
          .orderBy("created_at", "asc")
          .execute();
        return [
          ["ID", "Имя", "Телефон", "Email", "Создан", "Последняя активность"],
          ...rows.map((r) => [
            r.id.slice(0, 8),
            r.name,
            r.phone ?? "",
            r.email ?? "",
            new Date(r.created_at).toISOString(),
            new Date(r.last_seen_at).toISOString(),
          ]),
        ];
      }
      case "products": {
        const rows = await this.db
          .selectFrom("product")
          .select(["name", "price", "currency", "active", "created_at"])
          .where("business_id", "=", businessId)
          .orderBy("created_at", "asc")
          .execute();
        return [
          ["Название", "Цена", "Валюта", "Активен", "Создан"],
          ...rows.map((r) => [
            r.name,
            String(r.price),
            r.currency,
            r.active ? "да" : "нет",
            new Date(r.created_at).toISOString(),
          ]),
        ];
      }
      default:
        throw new AppError(400, "INVALID_ENTITY", "Неизвестный тип отчёта.");
    }
  }

  private async toXlsx(table: string[][], sheetName: string) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(sheetName.slice(0, 31));
    for (const row of table)
      ws.addRow(row.map((cell) => escapeSpreadsheetCell(cell)));
    const buf = await wb.xlsx.writeBuffer();
    return new Uint8Array(buf);
  }
}
