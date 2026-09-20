import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Kysely, Transaction } from "kysely";
import { verifyPassword } from "better-auth/crypto";
import type { Database } from "../db/schema.ts";
import { AppError } from "../http/errors.ts";
import { cancelConnectionDeliveries } from "../outbox/cancel-connection.ts";
import { audit } from "../audit/service.ts";

export const BUSINESS_DELETION_PHRASE = "УДАЛИТЬ";

export type BusinessDeletionImpact = {
  businessId: string;
  name: string;
  alreadyDeleted: boolean;
  members: number;
  customers: number;
  leads: number;
  orders: number;
  bookings: number;
  conversations: number;
  posts: number;
  products: number;
  connections: number;
  files: number;
  channelAdminBindings: number;
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function countWhere(
  db: Kysely<Database> | Transaction<Database>,
  run: () => Promise<number>,
) {
  try {
    return await run();
  } catch {
    return 0;
  }
}

export class BusinessDeletionService {
  constructor(private db: Kysely<Database>) {}

  async impact(
    userId: string,
    publicBusinessId: string,
  ): Promise<BusinessDeletionImpact> {
    const business = await this.requireOwner(userId, publicBusinessId);
    if (business.archived_at) {
      return {
        businessId: business.public_id,
        name: business.name,
        alreadyDeleted: true,
        members: 0,
        customers: 0,
        leads: 0,
        orders: 0,
        bookings: 0,
        conversations: 0,
        posts: 0,
        products: 0,
        connections: 0,
        files: 0,
        channelAdminBindings: 0,
      };
    }
    const id = business.id;
    const [
      members,
      customers,
      leads,
      orders,
      bookings,
      conversations,
      posts,
      products,
      connections,
      files,
      channelAdminBindings,
    ] = await Promise.all([
      countWhere(this.db, async () => {
        const row = await this.db
          .selectFrom("business_member")
          .select(({ fn }) => fn.countAll<number>().as("n"))
          .where("business_id", "=", id)
          .where("status", "=", "active")
          .executeTakeFirst();
        return Number(row?.n ?? 0);
      }),
      countWhere(this.db, async () => {
        const row = await this.db
          .selectFrom("client")
          .select(({ fn }) => fn.countAll<number>().as("n"))
          .where("business_id", "=", id)
          .executeTakeFirst();
        return Number(row?.n ?? 0);
      }),
      countWhere(this.db, async () => {
        const row = await this.db
          .selectFrom("lead")
          .select(({ fn }) => fn.countAll<number>().as("n"))
          .where("business_id", "=", id)
          .executeTakeFirst();
        return Number(row?.n ?? 0);
      }),
      countWhere(this.db, async () => {
        const row = await this.db
          .selectFrom("order")
          .select(({ fn }) => fn.countAll<number>().as("n"))
          .where("business_id", "=", id)
          .executeTakeFirst();
        return Number(row?.n ?? 0);
      }),
      countWhere(this.db, async () => {
        const row = await this.db
          .selectFrom("booking")
          .select(({ fn }) => fn.countAll<number>().as("n"))
          .where("business_id", "=", id)
          .executeTakeFirst();
        return Number(row?.n ?? 0);
      }),
      countWhere(this.db, async () => {
        const row = await this.db
          .selectFrom("communication_conversation")
          .select(({ fn }) => fn.countAll<number>().as("n"))
          .where("business_id", "=", id)
          .executeTakeFirst();
        return Number(row?.n ?? 0);
      }),
      countWhere(this.db, async () => {
        const row = await this.db
          .selectFrom("post")
          .select(({ fn }) => fn.countAll<number>().as("n"))
          .where("business_id", "=", id)
          .where("deleted_at", "is", null)
          .executeTakeFirst();
        return Number(row?.n ?? 0);
      }),
      countWhere(this.db, async () => {
        const row = await this.db
          .selectFrom("product")
          .select(({ fn }) => fn.countAll<number>().as("n"))
          .where("business_id", "=", id)
          .executeTakeFirst();
        return Number(row?.n ?? 0);
      }),
      countWhere(this.db, async () => {
        const row = await this.db
          .selectFrom("business_connection")
          .select(({ fn }) => fn.countAll<number>().as("n"))
          .where("business_id", "=", id)
          .executeTakeFirst();
        return Number(row?.n ?? 0);
      }),
      countWhere(this.db, async () => {
        const row = await this.db
          .selectFrom("attachment")
          .select(({ fn }) => fn.countAll<number>().as("n"))
          .where("business_id", "=", id)
          .executeTakeFirst();
        return Number(row?.n ?? 0);
      }),
      countWhere(this.db, async () => {
        const row = await this.db
          .selectFrom("business_channel_admin")
          .select(({ fn }) => fn.countAll<number>().as("n"))
          .where("business_id", "=", id)
          .where("status", "=", "active")
          .executeTakeFirst();
        return Number(row?.n ?? 0);
      }),
    ]);

    return {
      businessId: business.public_id,
      name: business.name,
      alreadyDeleted: false,
      members,
      customers,
      leads,
      orders,
      bookings,
      conversations,
      posts,
      products,
      connections,
      files,
      channelAdminBindings,
    };
  }

  async request(userId: string, publicBusinessId: string) {
    const business = await this.requireOwner(userId, publicBusinessId);
    if (business.archived_at)
      throw new AppError(409, "ALREADY_DELETED", "Бизнес уже удалён.");
    const impact = await this.impact(userId, publicBusinessId);
    const token = randomBytes(24).toString("hex");
    await this.db
      .insertInto("business_deletion_request")
      .values({
        id: randomUUID(),
        business_id: business.id,
        user_id: userId,
        token_hash: hashToken(token),
        impact_snapshot: JSON.stringify(impact),
        expires_at: new Date(Date.now() + 15 * 60 * 1000),
        consumed_at: null,
      })
      .execute();
    return { token, impact };
  }

  async confirm(
    userId: string,
    publicBusinessId: string,
    body: {
      token?: string;
      password?: string;
      confirmation?: string;
    },
  ) {
    const confirmation = String(body.confirmation ?? "").trim();
    const password = String(body.password ?? "");
    if (!password)
      throw new AppError(400, "PASSWORD_REQUIRED", "Введите пароль.");
    if (!body.token)
      throw new AppError(400, "TOKEN_REQUIRED", "Подтверждение устарело.");

    return this.db.transaction().execute(async (tx) => {
      const business = await this.requireOwnerTx(tx, userId, publicBusinessId);
      if (business.archived_at) {
        return { ok: true as const, alreadyDeleted: true };
      }

      const expectedName = business.name.trim();
      if (
        confirmation !== BUSINESS_DELETION_PHRASE &&
        confirmation !== expectedName
      ) {
        throw new AppError(
          400,
          "CONFIRMATION_MISMATCH",
          `Введите «${BUSINESS_DELETION_PHRASE}» или точное название бизнеса.`,
        );
      }

      const account = await tx
        .selectFrom("account")
        .select(["password"])
        .where("userId", "=", userId)
        .where("providerId", "=", "credential")
        .executeTakeFirst();
      if (!account?.password)
        throw new AppError(400, "PASSWORD_REQUIRED", "Введите пароль.");
      const passwordOk = await verifyPassword({
        hash: account.password,
        password,
      });
      if (!passwordOk)
        throw new AppError(403, "INVALID_PASSWORD", "Неверный пароль.");

      const request = await tx
        .selectFrom("business_deletion_request")
        .selectAll()
        .where("business_id", "=", business.id)
        .where("user_id", "=", userId)
        .where("token_hash", "=", hashToken(body.token!))
        .where("consumed_at", "is", null)
        .forUpdate()
        .executeTakeFirst();
      if (!request)
        throw new AppError(400, "TOKEN_INVALID", "Подтверждение устарело.");
      if (+request.expires_at < Date.now())
        throw new AppError(400, "TOKEN_EXPIRED", "Подтверждение устарело.");

      await archiveBusinessFully(tx, business.id, userId);

      await tx
        .updateTable("business_deletion_request")
        .set({ consumed_at: new Date() })
        .where("id", "=", request.id)
        .execute();

      return { ok: true as const, alreadyDeleted: false };
    });
  }

  private async requireOwner(userId: string, publicBusinessId: string) {
    return this.db.transaction().execute(async (tx) =>
      this.requireOwnerTx(tx, userId, publicBusinessId),
    );
  }

  private async requireOwnerTx(
    tx: Transaction<Database>,
    userId: string,
    publicBusinessId: string,
  ) {
    const membership = await tx
      .selectFrom("business as b")
      .innerJoin("business_member as m", "m.business_id", "b.id")
      .select([
        "b.id",
        "b.public_id",
        "b.name",
        "b.archived_at",
        "m.role",
        "m.status as member_status",
      ])
      .where("b.public_id", "=", publicBusinessId)
      .where("m.user_id", "=", userId)
      .executeTakeFirst();
    if (!membership)
      throw new AppError(404, "BUSINESS_NOT_FOUND", "Бизнес не найден.");
    if (membership.role !== "owner")
      throw new AppError(
        403,
        "FORBIDDEN",
        "Удалить бизнес может только владелец.",
      );
    // Active businesses require an active owner membership.
    // Archived businesses keep the owner row (revoked) for idempotent confirm.
    if (!membership.archived_at && membership.member_status !== "active")
      throw new AppError(404, "BUSINESS_NOT_FOUND", "Бизнес не найден.");
    return {
      id: membership.id,
      public_id: membership.public_id,
      name: membership.name,
      archived_at: membership.archived_at,
      role: membership.role,
    };
  }
}

/** Soft-delete business: archive, revoke access, disable channels/solutions. */
export async function archiveBusinessFully(
  tx: Transaction<Database>,
  businessId: string,
  actorUserId: string,
) {
  await tx
    .selectFrom("business")
    .select("id")
    .where("id", "=", businessId)
    .forUpdate()
    .executeTakeFirstOrThrow();

  await tx
    .updateTable("business")
    .set({ archived_at: new Date() })
    .where("id", "=", businessId)
    .where("archived_at", "is", null)
    .execute();

  await tx
    .updateTable("business_member")
    .set({ status: "revoked" })
    .where("business_id", "=", businessId)
    .where("status", "=", "active")
    .execute();

  await tx
    .updateTable("business_solution")
    .set({ status: "disabled", updated_at: new Date() })
    .where("business_id", "=", businessId)
    .where("status", "in", ["active", "trial"])
    .execute();

  const connections = await tx
    .selectFrom("business_connection")
    .select("id")
    .where("business_id", "=", businessId)
    .execute();
  for (const connection of connections) {
    await cancelConnectionDeliveries(tx, connection.id);
    await tx
      .deleteFrom("telegram_runtime")
      .where("connection_id", "=", connection.id)
      .execute();
    await tx
      .deleteFrom("vk_runtime")
      .where("connection_id", "=", connection.id)
      .execute();
    await tx
      .deleteFrom("connection_secret")
      .where("connection_id", "=", connection.id)
      .execute();
    await tx
      .updateTable("business_connection")
      .set({ status: "disconnected", updated_at: new Date() })
      .where("id", "=", connection.id)
      .execute();
  }

  await tx
    .updateTable("business_channel_admin")
    .set({ status: "revoked" })
    .where("business_id", "=", businessId)
    .where("status", "=", "active")
    .execute();
  await tx
    .deleteFrom("channel_admin_session")
    .where("business_id", "=", businessId)
    .execute();
  await tx
    .deleteFrom("channel_admin_challenge")
    .where("business_id", "=", businessId)
    .execute();

  await audit(tx, businessId, actorUserId, "settings_changed", businessId, {
    reason: "business_deleted",
  });
}
