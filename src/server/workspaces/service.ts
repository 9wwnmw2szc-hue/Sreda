import { createHash, randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import type { Database, Role } from "../db/schema.ts";
import { AppError } from "../http/errors.ts";
import { isUuid, parseBusiness, requireIdempotencyKey } from "./validation.ts";

export class WorkspaceService {
  constructor(private db: Kysely<Database>) {}

  private query(userId: string) {
    return this.db.selectFrom("business")
      .innerJoin("business_member as member", "member.business_id", "business.id")
      .innerJoin("business_member as owner", (join) => join
        .onRef("owner.business_id", "=", "business.id")
        .on("owner.role", "=", "owner").on("owner.status", "=", "active"))
      .where("member.user_id", "=", userId).where("member.status", "=", "active")
      .where("business.archived_at", "is", null)
      .select(["business.id", "business.name", "business.timezone",
        "member.role", "owner.user_id as ownerId"]);
  }

  async list(userId: string) {
    return this.query(userId).orderBy("business.created_at").orderBy("business.id").execute();
  }

  async require(userId: string, businessId: string, roles?: Role[]) {
    const business = isUuid(businessId)
      ? await this.query(userId).where("business.id", "=", businessId).executeTakeFirst()
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
      await tx.insertInto("business").values({ id, ...data, archived_at: null }).execute();
      await tx.insertInto("business_member").values({
        business_id: id, user_id: userId, role: "owner", status: "active",
      }).execute();
      await tx.insertInto("business_creation").values({
        user_id: userId, key, request_hash: hash, business_id: id,
      }).execute();
      return id;
    });
    return this.require(userId, businessId);
  }
}
