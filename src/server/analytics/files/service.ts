import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database } from "../../db/schema.ts";
import { requireBusiness } from "../../access/permissions.ts";
import { AppError } from "../../http/errors.ts";
import { audit } from "../../audit/service.ts";
import {
  attachmentStorage,
  type AttachmentStorage,
} from "../../attachments/storage.ts";
import { detectDataFile } from "./validate.ts";
import { parseDataFile, type ParsedWorkbook } from "./parse.ts";
import { ANALYTICS_LIMITS } from "../limits.ts";
import type { ColumnType } from "../schema.ts";

export class AnalyticsFileService {
  constructor(
    private db: Kysely<Database>,
    private storage: AttachmentStorage = attachmentStorage(),
  ) {}

  async list(userId: string, publicId: string) {
    const b = await requireBusiness(this.db, userId, publicId, "analytics.view");
    const rows = await this.db
      .selectFrom("business_data_file")
      .select([
        "id",
        "original_filename",
        "mime_type",
        "size_bytes",
        "file_type",
        "status",
        "version",
        "row_count",
        "sheet_count",
        "error_message",
        "created_at",
        "updated_at",
      ])
      .where("business_id", "=", b.id)
      .where("deleted_at", "is", null)
      .orderBy("created_at", "desc")
      .execute();
    return rows.map((r) => ({
      ...r,
      created_at: r.created_at.toISOString(),
      updated_at: r.updated_at.toISOString(),
    }));
  }

  async get(userId: string, publicId: string, fileId: string) {
    const b = await requireBusiness(this.db, userId, publicId, "analytics.view");
    const file = await this.ownedFile(b.id, fileId);
    const sheets = await this.db
      .selectFrom("business_data_sheet")
      .selectAll()
      .where("file_id", "=", file.id)
      .where("business_id", "=", b.id)
      .orderBy("position", "asc")
      .execute();
    return {
      file: {
        ...file,
        created_at: file.created_at.toISOString(),
        updated_at: file.updated_at.toISOString(),
        column_mapping: file.column_mapping,
      },
      sheets: sheets.map((s) => ({
        id: s.id,
        name: s.name,
        position: s.position,
        row_count: s.row_count,
        column_count: s.column_count,
        columns: s.columns_json,
        quality: s.quality_json,
      })),
    };
  }

  async upload(
    userId: string,
    publicId: string,
    filename: string,
    declaredMime: string,
    bytes: Uint8Array,
  ) {
    const b = await requireBusiness(
      this.db,
      userId,
      publicId,
      "analytics.upload",
    );
    const detected = detectDataFile(filename, declaredMime, bytes);
    const fileId = randomUUID();
    const parsedId = randomUUID();
    const storageKey = `${b.id}/${fileId}`;
    const parsedKey = `${b.id}/${parsedId}`;

    await this.storage.put(storageKey, bytes, detected.mime);

    await this.db
      .insertInto("business_data_file")
      .values({
        id: fileId,
        business_id: b.id,
        uploaded_by: userId,
        original_filename: filename.slice(0, 255),
        storage_key: storageKey,
        parsed_storage_key: null,
        mime_type: detected.mime,
        size_bytes: bytes.length,
        file_type: detected.fileType,
        status: "validating",
        row_count: null,
        sheet_count: null,
        error_code: null,
        error_message: null,
        deleted_at: null,
      })
      .execute();

    try {
      await this.db
        .updateTable("business_data_file")
        .set({ status: "parsing", updated_at: new Date() })
        .where("id", "=", fileId)
        .execute();

      const parsed = await parseDataFile(detected.fileType, bytes);
      const payload = Buffer.from(
        JSON.stringify({
          sheets: parsed.sheets.map((s) => ({
            name: s.name,
            columns: s.columns.map((c) => c.name),
            rows: s.rows,
          })),
        }),
        "utf8",
      );
      await this.storage.put(parsedKey, payload, "application/json");

      await this.db.transaction().execute(async (tx) => {
        await tx
          .updateTable("business_data_file")
          .set({
            status: "ready",
            parsed_storage_key: parsedKey,
            row_count: parsed.totalRows,
            sheet_count: parsed.sheets.length,
            error_code: null,
            error_message: null,
            updated_at: new Date(),
          })
          .where("id", "=", fileId)
          .where("business_id", "=", b.id)
          .execute();

        for (const [i, sheet] of parsed.sheets.entries()) {
          await tx
            .insertInto("business_data_sheet")
            .values({
              id: randomUUID(),
              file_id: fileId,
              business_id: b.id,
              name: sheet.name.slice(0, 200),
              position: i,
              row_count: sheet.rows.length,
              column_count: sheet.columns.length,
              columns_json: sheet.columns as unknown as string,
              quality_json: sheet.quality as unknown as string,
            })
            .execute();
        }

        await audit(tx, b.id, userId, "analytics_file_uploaded", fileId, {
          filename: filename.slice(0, 100),
          file_type: detected.fileType,
          rows: parsed.totalRows,
          sheets: parsed.sheets.length,
        });
      });
    } catch (error) {
      const message =
        error instanceof AppError
          ? error.message
          : "Не удалось обработать файл.";
      const code = error instanceof AppError ? error.code : "PARSE_FAILED";
      await this.db
        .updateTable("business_data_file")
        .set({
          status: "failed",
          error_code: code,
          error_message: message,
          updated_at: new Date(),
        })
        .where("id", "=", fileId)
        .execute();
      if (error instanceof AppError) throw error;
      throw new AppError(400, "PARSE_FAILED", message);
    }

    return this.get(userId, publicId, fileId);
  }

  async updateMapping(
    userId: string,
    publicId: string,
    fileId: string,
    mapping: Record<string, ColumnType | string>,
  ) {
    const b = await requireBusiness(
      this.db,
      userId,
      publicId,
      "analytics.upload",
    );
    await this.ownedFile(b.id, fileId);
    await this.db
      .updateTable("business_data_file")
      .set({
        column_mapping: JSON.stringify(mapping),
        updated_at: new Date(),
      })
      .where("id", "=", fileId)
      .where("business_id", "=", b.id)
      .execute();
    return this.get(userId, publicId, fileId);
  }

  async rows(
    userId: string,
    publicId: string,
    fileId: string,
    opts: {
      sheetId?: string;
      page?: number;
      search?: string;
      sortCol?: number;
      sortDir?: "asc" | "desc";
    } = {},
  ) {
    const b = await requireBusiness(this.db, userId, publicId, "analytics.view");
    const file = await this.ownedFile(b.id, fileId);
    if (file.status !== "ready" || !file.parsed_storage_key)
      throw new AppError(409, "FILE_NOT_READY", "Файл ещё не готов к просмотру.");

    const sheets = await this.db
      .selectFrom("business_data_sheet")
      .selectAll()
      .where("file_id", "=", file.id)
      .where("business_id", "=", b.id)
      .orderBy("position", "asc")
      .execute();
    if (!sheets.length)
      throw new AppError(404, "SHEET_NOT_FOUND", "Листы не найдены.");

    const sheet =
      (opts.sheetId
        ? sheets.find((s) => s.id === opts.sheetId)
        : sheets[0]) ?? null;
    if (!sheet)
      throw new AppError(404, "SHEET_NOT_FOUND", "Лист не найден.");

    const parsed = JSON.parse(
      Buffer.from(await this.storage.get(file.parsed_storage_key)).toString(
        "utf8",
      ),
    ) as {
      sheets: { name: string; columns: string[]; rows: unknown[][] }[];
    };
    const blob =
      parsed.sheets.find((s) => s.name === sheet.name) ?? parsed.sheets[sheet.position];
    if (!blob)
      throw new AppError(404, "SHEET_NOT_FOUND", "Данные листа не найдены.");

    let rows = blob.rows.map((r, i) => ({ i, cells: r }));
    if (opts.search) {
      const q = opts.search.toLowerCase();
      rows = rows.filter((r) =>
        r.cells.some((c) => String(c ?? "").toLowerCase().includes(q)),
      );
    }
    if (opts.sortCol != null && Number.isFinite(opts.sortCol)) {
      const dir = opts.sortDir === "desc" ? -1 : 1;
      const col = opts.sortCol;
      rows.sort((a, b) => {
        const av = a.cells[col];
        const bv = b.cells[col];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === "number" && typeof bv === "number")
          return (av - bv) * dir;
        return String(av).localeCompare(String(bv), "ru") * dir;
      });
    }

    const page = Math.max(0, opts.page ?? 0);
    const size = ANALYTICS_LIMITS.viewerPageSize;
    const slice = rows.slice(page * size, page * size + size);
    return {
      sheetId: sheet.id,
      sheetName: sheet.name,
      columns: blob.columns,
      columnProfiles: sheet.columns_json,
      total: rows.length,
      page,
      pageSize: size,
      rows: slice.map((r) => ({ index: r.i, cells: r.cells })),
    };
  }

  async download(userId: string, publicId: string, fileId: string) {
    const b = await requireBusiness(
      this.db,
      userId,
      publicId,
      "analytics.view",
    );
    const file = await this.ownedFile(b.id, fileId);
    const bytes = await this.storage.get(file.storage_key);
    return {
      bytes,
      filename: file.original_filename,
      mime: file.mime_type,
    };
  }

  async remove(userId: string, publicId: string, fileId: string) {
    const b = await requireBusiness(
      this.db,
      userId,
      publicId,
      "analytics.upload",
    );
    const file = await this.ownedFile(b.id, fileId);
    await this.db.transaction().execute(async (tx) => {
      await tx
        .updateTable("business_data_file")
        .set({ deleted_at: new Date(), updated_at: new Date() })
        .where("id", "=", file.id)
        .where("business_id", "=", b.id)
        .execute();
      await audit(tx, b.id, userId, "analytics_file_deleted", file.id, {
        filename: file.original_filename.slice(0, 100),
      });
    });
    await this.storage.remove(file.storage_key).catch(() => {});
    if (file.parsed_storage_key)
      await this.storage.remove(file.parsed_storage_key).catch(() => {});
    return { ok: true };
  }

  /** Load parsed workbook for AI tools — never logs cell contents. */
  async loadParsed(
    businessId: string,
    fileId: string,
  ): Promise<{ fileName: string; version: number; workbook: ParsedWorkbook }> {
    const file = await this.ownedFile(businessId, fileId);
    if (file.status !== "ready" || !file.parsed_storage_key)
      throw new AppError(409, "FILE_NOT_READY", "Файл ещё не готов.");
    const sheetsMeta = await this.db
      .selectFrom("business_data_sheet")
      .selectAll()
      .where("file_id", "=", file.id)
      .where("business_id", "=", businessId)
      .orderBy("position", "asc")
      .execute();
    const parsed = JSON.parse(
      Buffer.from(await this.storage.get(file.parsed_storage_key)).toString(
        "utf8",
      ),
    ) as {
      sheets: { name: string; columns: string[]; rows: (string | number | boolean | null)[][] }[];
    };
    return {
      fileName: file.original_filename,
      version: file.version,
      workbook: {
        totalRows: file.row_count ?? 0,
        sheets: parsed.sheets.map((s, i) => ({
          name: s.name,
          columns: (sheetsMeta[i]?.columns_json as never) ?? s.columns.map((name) => ({
            name,
            inferredType: "unknown",
            nonNullCount: 0,
            nullCount: 0,
            uniqueCount: null,
            samples: [],
          })),
          rows: s.rows,
          quality: (sheetsMeta[i]?.quality_json as never) ?? {
            emptyRows: 0,
            duplicateHeaders: [],
            issues: [],
          },
        })),
      },
    };
  }

  private async ownedFile(businessId: string, fileId: string) {
    const file = await this.db
      .selectFrom("business_data_file")
      .selectAll()
      .where("id", "=", fileId)
      .where("business_id", "=", businessId)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    if (!file)
      throw new AppError(404, "FILE_NOT_FOUND", "Таблица не найдена.");
    return file;
  }
}
