import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import { requireBusiness } from "../access/permissions.ts";
import { AppError } from "../http/errors.ts";

export class ReplyTemplateService {
  constructor(private db: Kysely<Database>) {}

  async list(userId: string, publicId: string) {
    const b = await requireBusiness(
      this.db,
      userId,
      publicId,
      "messages.write",
    );
    return this.db
      .selectFrom("reply_template")
      .select(["id", "title", "body", "updated_at as updatedAt"])
      .where("business_id", "=", b.id)
      .where("archived_at", "is", null)
      .orderBy("updated_at", "desc")
      .limit(100)
      .execute()
      .then((rows) =>
        rows.map((r) => ({
          ...r,
          updatedAt: r.updatedAt.toISOString(),
        })),
      );
  }

  async save(
    userId: string,
    publicId: string,
    body: Record<string, unknown>,
  ) {
    const b = await requireBusiness(
      this.db,
      userId,
      publicId,
      "messages.write",
    );
    const title = String(body.title ?? "").trim();
    const text = String(body.body ?? "").trim();
    if (!title || title.length > 80 || !text || text.length > 2000)
      throw new AppError(
        400,
        "INVALID_TEMPLATE",
        "Заголовок до 80 и текст до 2000 символов.",
      );
    const id =
      typeof body.id === "string" &&
      /^[0-9a-f-]{36}$/i.test(body.id)
        ? body.id
        : null;
    const now = new Date();
    if (id) {
      const owned = await this.db
        .selectFrom("reply_template")
        .select("id")
        .where("business_id", "=", b.id)
        .where("id", "=", id)
        .executeTakeFirst();
      if (!owned)
        throw new AppError(404, "TEMPLATE_NOT_FOUND", "Шаблон не найден.");
      await this.db
        .updateTable("reply_template")
        .set({
          title,
          body: text,
          updated_at: now,
          archived_at: null,
        })
        .where("id", "=", id)
        .where("business_id", "=", b.id)
        .execute();
      return { id };
    }
    const created = randomUUID();
    await this.db
      .insertInto("reply_template")
      .values({
        id: created,
        business_id: b.id,
        title,
        body: text,
        created_by: userId,
        updated_at: now,
      })
      .execute();
    return { id: created };
  }

  async archive(userId: string, publicId: string, templateId: string) {
    const b = await requireBusiness(
      this.db,
      userId,
      publicId,
      "messages.write",
    );
    await this.db
      .updateTable("reply_template")
      .set({ archived_at: new Date(), updated_at: new Date() })
      .where("business_id", "=", b.id)
      .where("id", "=", templateId)
      .execute();
    return { ok: true };
  }
}
