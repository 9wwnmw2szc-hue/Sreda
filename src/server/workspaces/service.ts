import { createHash, randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import type { Database, Role } from "../db/schema.ts";
import { AppError } from "../http/errors.ts";
import { parseBusiness, requireIdempotencyKey } from "./validation.ts";

export class WorkspaceService {
  constructor(private db: Kysely<Database>) {}

  private async resolveUserId(userId: string) {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(userId)) return userId;
    const row = await this.db.selectFrom("user").select("id").where("public_id", "=", userId).executeTakeFirst();
    if (!row) throw new AppError(404, "NOT_FOUND", "Бизнес не найден.");
    return row.id;
  }

  private query(userId: string) {
    return this.db.selectFrom("business")
      .innerJoin("business_member as member", "member.business_id", "business.id")
      .innerJoin("business_member as owner", (join) => join
        .onRef("owner.business_id", "=", "business.id")
        .on("owner.role", "=", "owner").on("owner.status", "=", "active"))
      .innerJoin("user as owner_user", "owner_user.id", "owner.user_id")
      .where("member.user_id", "=", userId).where("member.status", "=", "active")
      .where("business.archived_at", "is", null)
      .select(["business.public_id as id", "business.name", "business.timezone",
        "member.role", "owner_user.public_id as ownerId"]);
  }

  async list(userId: string) {
    return this.query(await this.resolveUserId(userId)).orderBy("business.created_at").orderBy("business.id").execute();
  }

  async require(userId: string, businessId: string, roles?: Role[]) {
    userId = await this.resolveUserId(userId);
    const business = /^biz_[a-f0-9]{20}$/.test(businessId)
      ? await this.query(userId).where("business.public_id", "=", businessId).executeTakeFirst()
      : undefined;
    if (!business) throw new AppError(404, "NOT_FOUND", "Бизнес не найден.");
    if (roles && !roles.includes(business.role)) {
      throw new AppError(403, "FORBIDDEN", "Недостаточно прав для этого действия.");
    }
    return business;
  }

  async create(userId: string, input: Record<string, unknown>, rawKey: string | null) {
    const data = parseBusiness(input);
    const key = requireIdempotencyKey(rawKey);
    const hash = createHash("sha256").update(JSON.stringify(data)).digest("hex");
    const businessId = await this.db.transaction().execute(async (tx) => {
      // Serialize creation per account across processes, including double clicks.
      await sql`select pg_advisory_xact_lock(hashtextextended(${"business:" + userId}, 0))`.execute(tx);
      const previous = await tx.selectFrom("business_creation").selectAll()
        .where("user_id", "=", userId).where("key", "=", key).executeTakeFirst();
      if (previous) {
        if (previous.request_hash !== hash) throw new AppError(409, "IDEMPOTENCY_CONFLICT",
          "Этот запрос уже использован. Обновите страницу перед новым созданием.");
        return previous.business_id;
      }
      const owned = await tx.selectFrom("business_member").select("business_id")
        .where("user_id", "=", userId).where("role", "=", "owner").execute();
      if (owned.length >= 20) throw new AppError(409, "BUSINESS_LIMIT", "Достигнут лимит: 20 бизнесов на аккаунт.");
      const id = randomUUID();
      await tx.insertInto("business").values({ id, public_id: "biz_" + randomUUID().replaceAll("-", "").slice(0, 20), ...data, archived_at: null }).execute();
      await tx.insertInto("business_member").values({
        business_id: id, user_id: userId, role: "owner", status: "active",
      }).execute();
      await tx.insertInto("business_creation").values({
        user_id: userId, key, request_hash: hash, business_id: id,
      }).execute();
      return id;
    });
    const publicId = await this.db.selectFrom("business").select("public_id").where("id", "=", businessId).executeTakeFirstOrThrow();
    return this.require(userId, publicId.public_id);
  }
}
