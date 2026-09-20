import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Kysely, Transaction } from "kysely";
import type { Database, Role } from "../db/schema.ts";
import {
  allowed,
  requireBusiness,
  type Permission,
} from "../access/permissions.ts";
import { AppError } from "../http/errors.ts";
import { audit } from "../audit/service.ts";

export type ChannelPlatform = "telegram" | "vk";

const ALL_PERMISSIONS: Permission[] = [
  "clients.read",
  "clients.write",
  "leads.write",
  "messages.write",
  "booking.write",
  "orders.write",
  "posts.manage",
  "settings.manage",
  "connections.manage",
  "solutions.manage",
  "notifications.read",
  "analytics.view",
  "analytics.export",
  "analytics.upload",
  "analytics.ai",
];

export type ChannelAdminResolved = {
  userId: string;
  role: Role;
  businessId: string;
  publicBusinessId: string;
  businessName: string;
  permissions: Permission[];
};

export type ChannelAdminBusinessRow = {
  businessId: string;
  publicBusinessId: string;
  businessName: string;
  role: Role;
  platform: ChannelPlatform;
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function platformOf(value: unknown): ChannelPlatform {
  if (value === "vk") return "vk";
  if (value === "telegram") return "telegram";
  throw new AppError(400, "INVALID_PLATFORM", "Укажите telegram или vk.");
}

function permissionsFor(role: Role): Permission[] {
  return ALL_PERMISSIONS.filter((p) => allowed(role, p));
}

async function requireSettingsOrConnections(
  db: Kysely<Database>,
  userId: string,
  publicId: string,
) {
  const business = await db
    .selectFrom("business as b")
    .innerJoin("business_member as m", "m.business_id", "b.id")
    .select(["b.id", "b.public_id", "m.role"])
    .where("b.public_id", "=", publicId)
    .where("b.archived_at", "is", null)
    .where("m.user_id", "=", userId)
    .where("m.status", "=", "active")
    .executeTakeFirst();
  if (!business)
    throw new AppError(404, "BUSINESS_NOT_FOUND", "Бизнес не найден.");
  if (
    !allowed(business.role, "settings.manage") &&
    !allowed(business.role, "connections.manage")
  )
    throw new AppError(403, "FORBIDDEN", "Недостаточно прав.");
  return business;
}

async function findReadyConnection(
  db: Kysely<Database>,
  businessId: string,
  platform: ChannelPlatform,
) {
  if (platform === "telegram") {
    return db
      .selectFrom("business_connection as c")
      .innerJoin("telegram_runtime as r", "r.connection_id", "c.id")
      .select("c.id")
      .where("c.business_id", "=", businessId)
      .where("c.platform", "=", "telegram")
      .where("c.status", "=", "connected")
      .where("r.status", "=", "ready")
      .executeTakeFirst();
  }
  return db
    .selectFrom("business_connection as c")
    .innerJoin("vk_runtime as r", "r.connection_id", "c.id")
    .select("c.id")
    .where("c.business_id", "=", businessId)
    .where("c.platform", "=", "vk")
    .where("c.status", "=", "connected")
    .where("r.status", "=", "ready")
    .executeTakeFirst();
}

export class ChannelAdminBindingService {
  constructor(private db: Kysely<Database>) {}

  async list(userId: string, businessPublicId: string) {
    const b = await requireSettingsOrConnections(
      this.db,
      userId,
      businessPublicId,
    );
    const rows = await this.db
      .selectFrom("business_channel_admin as a")
      .innerJoin("provider_identity as p", "p.id", "a.provider_identity_id")
      .innerJoin("user as u", "u.id", "a.user_id")
      .select([
        "a.platform",
        "a.status",
        "a.bound_at",
        "a.last_active_at",
        "p.display_name",
        "p.username",
        "p.external_user_id",
        "u.public_id as user_public_id",
      ])
      .where("a.business_id", "=", b.id)
      .orderBy("a.bound_at", "desc")
      .execute();
    return rows.map((row) => ({
      platform: row.platform,
      displayName: row.display_name,
      username: row.username,
      externalUserId: row.external_user_id,
      userPublicId: row.user_public_id,
      status: row.status,
      boundAt: row.bound_at,
      lastActiveAt: row.last_active_at,
    }));
  }

  async createWebChallenge(
    userId: string,
    businessPublicId: string,
    platformRaw: unknown,
  ) {
    const platform = platformOf(platformRaw);
    return this.db.transaction().execute(async (tx) => {
      const b = await requireBusiness(
        tx,
        userId,
        businessPublicId,
        "settings.manage",
      );
      await tx
        .selectFrom("business")
        .select("id")
        .where("id", "=", b.id)
        .forUpdate()
        .execute();
      await requireBusiness(tx, userId, businessPublicId, "settings.manage");

      const connection = await findReadyConnection(tx, b.id, platform);
      if (!connection)
        throw new AppError(
          409,
          "CONNECTION_REQUIRED",
          platform === "telegram"
            ? "Сначала запустите Telegram-бота бизнеса."
            : "Сначала подключите и запустите VK-сообщество бизнеса.",
        );

      const open = await tx
        .selectFrom("channel_admin_challenge")
        .select((eb) => eb.fn.countAll<string>().as("n"))
        .where("user_id", "=", userId)
        .where("business_id", "=", b.id)
        .where("platform", "=", platform)
        .where("consumed_at", "is", null)
        .where("expires_at", ">", new Date())
        .executeTakeFirstOrThrow();
      if (Number(open.n) >= 5)
        throw new AppError(
          429,
          "CHALLENGE_LIMIT",
          "Слишком много открытых кодов. Подождите или используйте существующий.",
        );

      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await tx
        .insertInto("channel_admin_challenge")
        .values({
          id: randomUUID(),
          purpose: "bind_from_web",
          token_hash: hashToken(token),
          user_id: userId,
          business_id: b.id,
          platform,
          connection_id: connection.id,
          expires_at: expiresAt,
          consumed_at: null,
        })
        .execute();

      return {
        deepLinkHint:
          platform === "telegram" ? "/start admin_" + token : "admin_" + token,
        token,
        expiresAt,
        platform,
      };
    });
  }

  async consumeChallenge(
    tx: Transaction<Database>,
    input: {
      businessId: string;
      connectionId: string;
      platform: ChannelPlatform;
      externalUserId: string;
      username?: string;
      displayName?: string;
      token: string;
    },
  ): Promise<{ userId: string; businessId: string }> {
    const token = input.token.trim();
    if (!token || token.length < 16 || token.length > 128)
      throw new AppError(400, "INVALID_TOKEN", "Код недействителен.");

    const challenge = await tx
      .selectFrom("channel_admin_challenge")
      .selectAll()
      .where("token_hash", "=", hashToken(token))
      .forUpdate()
      .executeTakeFirst();
    if (!challenge)
      throw new AppError(400, "INVALID_TOKEN", "Код недействителен.");
    if (challenge.purpose !== "bind_from_web")
      throw new AppError(400, "INVALID_TOKEN", "Код недействителен.");
    if (challenge.consumed_at)
      throw new AppError(409, "TOKEN_USED", "Код уже использован.");
    if (challenge.expires_at.getTime() <= Date.now())
      throw new AppError(410, "TOKEN_EXPIRED", "Срок действия кода истёк.");
    if (
      challenge.business_id !== input.businessId ||
      challenge.platform !== input.platform
    )
      throw new AppError(
        400,
        "TOKEN_MISMATCH",
        "Код выдан для другого бизнеса или канала.",
      );

    const connection = await tx
      .selectFrom("business_connection")
      .select(["id", "platform", "status"])
      .where("id", "=", input.connectionId)
      .where("business_id", "=", input.businessId)
      .executeTakeFirst();
    if (
      !connection ||
      connection.platform !== input.platform ||
      connection.status !== "connected"
    )
      throw new AppError(409, "CONNECTION_REQUIRED", "Канал не подключён.");

    const member = await tx
      .selectFrom("business_member")
      .select(["user_id", "role", "status"])
      .where("business_id", "=", challenge.business_id)
      .where("user_id", "=", challenge.user_id)
      .executeTakeFirst();
    if (!member || member.status !== "active")
      throw new AppError(403, "FORBIDDEN", "Нет доступа к бизнесу.");

    const existing = await tx
      .selectFrom("provider_identity")
      .selectAll()
      .where("platform", "=", input.platform)
      .where("external_user_id", "=", input.externalUserId)
      .forUpdate()
      .executeTakeFirst();

    let identityId: string;
    if (existing) {
      if (existing.user_id !== challenge.user_id)
        throw new AppError(
          409,
          "IDENTITY_CONFLICT",
          "Этот аккаунт уже привязан к другому пользователю.",
        );
      identityId = existing.id;
      await tx
        .updateTable("provider_identity")
        .set({
          display_name: input.displayName ?? existing.display_name,
          username: input.username ?? existing.username,
          revoked_at: null,
        })
        .where("id", "=", existing.id)
        .execute();
    } else {
      const prior = await tx
        .selectFrom("provider_identity")
        .select("id")
        .where("user_id", "=", challenge.user_id)
        .where("platform", "=", input.platform)
        .where("revoked_at", "is", null)
        .execute();
      for (const row of prior) {
        await tx
          .updateTable("provider_identity")
          .set({ revoked_at: new Date() })
          .where("id", "=", row.id)
          .execute();
      }
      identityId = randomUUID();
      await tx
        .insertInto("provider_identity")
        .values({
          id: identityId,
          user_id: challenge.user_id,
          platform: input.platform,
          external_user_id: input.externalUserId,
          display_name: input.displayName ?? null,
          username: input.username ?? null,
          revoked_at: null,
        })
        .execute();
    }

    await tx
      .insertInto("business_channel_admin")
      .values({
        business_id: challenge.business_id,
        user_id: challenge.user_id,
        platform: input.platform,
        provider_identity_id: identityId,
        connection_id: input.connectionId,
        status: "active",
        revoked_at: null,
        last_active_at: new Date(),
      })
      .onConflict((oc) =>
        oc.columns(["business_id", "user_id", "platform"]).doUpdateSet({
          provider_identity_id: identityId,
          connection_id: input.connectionId,
          status: "active",
          revoked_at: null,
          bound_at: new Date(),
          last_active_at: new Date(),
        }),
      )
      .execute();

    await tx
      .updateTable("channel_admin_challenge")
      .set({ consumed_at: new Date(), connection_id: input.connectionId })
      .where("id", "=", challenge.id)
      .execute();

    await audit(
      tx,
      challenge.business_id,
      challenge.user_id,
      "settings_changed",
      challenge.user_id,
      { channel: input.platform, action: "channel_admin_bound" },
    );

    return { userId: challenge.user_id, businessId: challenge.business_id };
  }

  async revoke(
    userId: string,
    businessPublicId: string,
    platformRaw: unknown,
    targetUserPublicId?: string,
  ) {
    const platform = platformOf(platformRaw);
    return this.db.transaction().execute(async (tx) => {
      const actor = await tx
        .selectFrom("business as b")
        .innerJoin("business_member as m", "m.business_id", "b.id")
        .select(["b.id", "b.public_id", "m.role"])
        .where("b.public_id", "=", businessPublicId)
        .where("b.archived_at", "is", null)
        .where("m.user_id", "=", userId)
        .where("m.status", "=", "active")
        .executeTakeFirst();
      if (!actor)
        throw new AppError(404, "BUSINESS_NOT_FOUND", "Бизнес не найден.");
      await tx
        .selectFrom("business")
        .select("id")
        .where("id", "=", actor.id)
        .forUpdate()
        .execute();

      let targetUserId = userId;
      if (typeof targetUserPublicId === "string" && targetUserPublicId) {
        const target = await tx
          .selectFrom("user")
          .select("id")
          .where("public_id", "=", targetUserPublicId)
          .executeTakeFirst();
        if (!target)
          throw new AppError(404, "USER_NOT_FOUND", "Пользователь не найден.");
        if (target.id !== userId) {
          if (actor.role !== "owner" && actor.role !== "admin")
            throw new AppError(403, "FORBIDDEN", "Недостаточно прав.");
        }
        targetUserId = target.id;
      }

      const binding = await tx
        .selectFrom("business_channel_admin as a")
        .innerJoin("provider_identity as p", "p.id", "a.provider_identity_id")
        .select([
          "a.user_id",
          "a.status",
          "p.external_user_id",
          "a.connection_id",
        ])
        .where("a.business_id", "=", actor.id)
        .where("a.user_id", "=", targetUserId)
        .where("a.platform", "=", platform)
        .forUpdate()
        .executeTakeFirst();
      if (!binding || binding.status !== "active")
        throw new AppError(404, "BINDING_NOT_FOUND", "Привязка не найдена.");

      await tx
        .updateTable("business_channel_admin")
        .set({ status: "revoked", revoked_at: new Date() })
        .where("business_id", "=", actor.id)
        .where("user_id", "=", targetUserId)
        .where("platform", "=", platform)
        .execute();

      await tx
        .deleteFrom("channel_admin_session")
        .where("platform", "=", platform)
        .where("external_user_id", "=", binding.external_user_id)
        .where("business_id", "=", actor.id)
        .execute();

      await audit(tx, actor.id, userId, "settings_changed", targetUserId, {
        channel: platform,
        action: "channel_admin_revoked",
      });
      return { ok: true as const };
    });
  }

  async resolveAdmin(
    tx: Transaction<Database> | Kysely<Database>,
    input: {
      connectionId: string;
      businessId: string;
      platform: ChannelPlatform;
      externalUserId: string;
    },
  ): Promise<ChannelAdminResolved | null> {
    const row = await tx
      .selectFrom("business_channel_admin as a")
      .innerJoin("provider_identity as p", "p.id", "a.provider_identity_id")
      .innerJoin("business_member as m", (j) =>
        j
          .onRef("m.business_id", "=", "a.business_id")
          .onRef("m.user_id", "=", "a.user_id"),
      )
      .innerJoin("business as b", "b.id", "a.business_id")
      .select([
        "a.user_id",
        "m.role",
        "a.business_id",
        "b.public_id",
        "b.name",
      ])
      .where("a.business_id", "=", input.businessId)
      .where("a.platform", "=", input.platform)
      .where("a.status", "=", "active")
      .where("m.status", "=", "active")
      .where("p.platform", "=", input.platform)
      .where("p.external_user_id", "=", input.externalUserId)
      .where("p.revoked_at", "is", null)
      .where("b.archived_at", "is", null)
      .executeTakeFirst();

    if (!row) return null;
    void input.connectionId;

    await tx
      .updateTable("business_channel_admin")
      .set({ last_active_at: new Date() })
      .where("business_id", "=", row.business_id)
      .where("user_id", "=", row.user_id)
      .where("platform", "=", input.platform)
      .execute();

    return {
      userId: row.user_id,
      role: row.role,
      businessId: row.business_id,
      publicBusinessId: row.public_id,
      businessName: row.name,
      permissions: permissionsFor(row.role),
    };
  }

  async listBusinessesForIdentity(
    tx: Transaction<Database> | Kysely<Database>,
    platform: ChannelPlatform,
    externalUserId: string,
  ): Promise<ChannelAdminBusinessRow[]> {
    const rows = await tx
      .selectFrom("business_channel_admin as a")
      .innerJoin("provider_identity as p", "p.id", "a.provider_identity_id")
      .innerJoin("business_member as m", (j) =>
        j
          .onRef("m.business_id", "=", "a.business_id")
          .onRef("m.user_id", "=", "a.user_id"),
      )
      .innerJoin("business as b", "b.id", "a.business_id")
      .select([
        "a.business_id",
        "b.public_id",
        "b.name",
        "m.role",
        "a.platform",
      ])
      .where("a.platform", "=", platform)
      .where("a.status", "=", "active")
      .where("m.status", "=", "active")
      .where("p.platform", "=", platform)
      .where("p.external_user_id", "=", externalUserId)
      .where("p.revoked_at", "is", null)
      .where("b.archived_at", "is", null)
      .orderBy("b.name")
      .execute();
    return rows.map((row) => ({
      businessId: row.business_id,
      publicBusinessId: row.public_id,
      businessName: row.name,
      role: row.role,
      platform: row.platform,
    }));
  }
}
