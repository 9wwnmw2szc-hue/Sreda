import { createHash, randomBytes, randomUUID } from "node:crypto";
import { sql, type Kysely, type Transaction } from "kysely";
import { verifyPassword } from "better-auth/crypto";
import type { Database } from "../db/schema.ts";
import { AppError } from "../http/errors.ts";
import { archiveBusinessFully } from "../business/deletion.ts";

export const ACCOUNT_DELETION_PHRASE = "УДАЛИТЬ";

type DeletionStatus = "active" | "pending" | "deleted";

export type BusinessImpact = {
  id: string;
  name: string;
  role: "owner" | "admin" | "operator";
  memberCount: number;
  otherMembers: { id: string; name: string; username: string; role: string }[];
  requiresDecision: boolean;
};

export type DeletionImpact = {
  status: DeletionStatus;
  ownedBusinesses: BusinessImpact[];
  memberBusinesses: BusinessImpact[];
  notificationBindings: number;
  canDeleteImmediately: boolean;
  blockers: string[];
};

export type BusinessDecision = {
  businessId: string;
  action: "archive" | "transfer";
  transferToUserId?: string;
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function deletedUsername(publicId: string) {
  const suffix = publicId.replace(/^usr_/, "").slice(0, 16);
  return `deleted_${suffix}`;
}

export class AccountDeletionService {
  constructor(private db: Kysely<Database>) {}

  async impact(userId: string): Promise<DeletionImpact> {
    const user = await this.db
      .selectFrom("user")
      .select(["id", "deletion_status"])
      .where("id", "=", userId)
      .executeTakeFirst();
    if (!user) throw new AppError(404, "USER_NOT_FOUND", "Пользователь не найден.");
    if (user.deletion_status === "deleted") {
      return {
        status: "deleted",
        ownedBusinesses: [],
        memberBusinesses: [],
        notificationBindings: 0,
        canDeleteImmediately: false,
        blockers: ["Аккаунт уже удалён."],
      };
    }

    const memberships = await this.db
      .selectFrom("business_member as m")
      .innerJoin("business as b", "b.id", "m.business_id")
      .select([
        "b.id",
        "b.public_id",
        "b.name",
        "m.role",
      ])
      .where("m.user_id", "=", userId)
      .where("m.status", "=", "active")
      .where("b.archived_at", "is", null)
      .orderBy("b.name")
      .execute();

    const ownedBusinesses: BusinessImpact[] = [];
    const memberBusinesses: BusinessImpact[] = [];

    for (const row of memberships) {
      const members = await this.db
        .selectFrom("business_member as m")
        .innerJoin("user as u", "u.id", "m.user_id")
        .select([
          "u.public_id",
          "u.name",
          "u.username",
          "m.role",
        ])
        .where("m.business_id", "=", row.id)
        .where("m.status", "=", "active")
        .where("m.user_id", "!=", userId)
        .orderBy("m.role")
        .execute();
      const item: BusinessImpact = {
        id: row.public_id,
        name: row.name,
        role: row.role,
        memberCount: members.length + 1,
        otherMembers: members.map((m) => ({
          id: m.public_id,
          name: m.name,
          username: m.username,
          role: m.role,
        })),
        requiresDecision: row.role === "owner",
      };
      if (row.role === "owner") ownedBusinesses.push(item);
      else memberBusinesses.push(item);
    }

    const bindings = await this.db
      .selectFrom("notification_binding")
      .select((eb) => eb.fn.countAll<string>().as("n"))
      .where("user_id", "=", userId)
      .executeTakeFirst();

    const blockers: string[] = [];
    for (const b of ownedBusinesses) {
      blockers.push(
        `Вы единственный владелец «${b.name}». Передайте владение или удалите бизнес вместе с аккаунтом.`,
      );
    }

    return {
      status: user.deletion_status,
      ownedBusinesses,
      memberBusinesses,
      notificationBindings: Number(bindings?.n ?? 0),
      canDeleteImmediately: ownedBusinesses.length === 0,
      blockers,
    };
  }

  async request(userId: string) {
    const impact = await this.impact(userId);
    if (impact.status === "deleted")
      throw new AppError(409, "ALREADY_DELETED", "Аккаунт уже удалён.");

    return this.db.transaction().execute(async (tx) => {
      const user = await tx
        .selectFrom("user")
        .select(["id", "deletion_status"])
        .where("id", "=", userId)
        .forUpdate()
        .executeTakeFirst();
      if (!user)
        throw new AppError(404, "USER_NOT_FOUND", "Пользователь не найден.");
      if (user.deletion_status === "deleted")
        throw new AppError(409, "ALREADY_DELETED", "Аккаунт уже удалён.");

      const open = await tx
        .selectFrom("account_deletion_request")
        .select((eb) => eb.fn.countAll<string>().as("n"))
        .where("user_id", "=", userId)
        .where("consumed_at", "is", null)
        .where("expires_at", ">", new Date())
        .executeTakeFirstOrThrow();
      if (Number(open.n) >= 3)
        throw new AppError(
          429,
          "DELETION_RATE",
          "Слишком много запросов на удаление. Подождите и попробуйте снова.",
        );

      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await tx
        .insertInto("account_deletion_request")
        .values({
          id: randomUUID(),
          user_id: userId,
          token_hash: hashToken(token),
          impact_snapshot: JSON.stringify({
            owned: impact.ownedBusinesses.map((b) => b.id),
            members: impact.memberBusinesses.map((b) => b.id),
          }),
          business_decisions: JSON.stringify({}),
          expires_at: expiresAt,
          consumed_at: null,
        })
        .execute();

      await tx
        .insertInto("account_security_event")
        .values({
          id: randomUUID(),
          user_id: userId,
          action: "account_deletion_requested",
        })
        .execute();

      return { token, expiresAt, impact };
    });
  }

  async confirm(
    userId: string,
    body: {
      token?: unknown;
      password?: unknown;
      confirmation?: unknown;
      decisions?: unknown;
    },
  ) {
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const password =
      typeof body.password === "string" ? body.password : "";
    const confirmation =
      typeof body.confirmation === "string" ? body.confirmation.trim() : "";
    if (!token || token.length < 16)
      throw new AppError(400, "INVALID_TOKEN", "Код подтверждения недействителен.");
    if (password.length < 10 || password.length > 128)
      throw new AppError(400, "PASSWORD_REQUIRED", "Введите пароль.");
    if (confirmation !== ACCOUNT_DELETION_PHRASE)
      throw new AppError(
        400,
        "CONFIRMATION_REQUIRED",
        `Введите слово ${ACCOUNT_DELETION_PHRASE} для подтверждения.`,
      );

    const decisions = parseDecisions(body.decisions);

    return this.db.transaction().execute(async (tx) => {
      const user = await tx
        .selectFrom("user")
        .select(["id", "public_id", "deletion_status", "username"])
        .where("id", "=", userId)
        .forUpdate()
        .executeTakeFirst();
      if (!user)
        throw new AppError(404, "USER_NOT_FOUND", "Пользователь не найден.");
      if (user.deletion_status === "deleted")
        return { ok: true as const, alreadyDeleted: true };

      await tx
        .updateTable("user")
        .set({ deletion_status: "pending" })
        .where("id", "=", userId)
        .execute();

      const request = await tx
        .selectFrom("account_deletion_request")
        .selectAll()
        .where("token_hash", "=", hashToken(token))
        .where("user_id", "=", userId)
        .forUpdate()
        .executeTakeFirst();
      if (!request)
        throw new AppError(400, "INVALID_TOKEN", "Код подтверждения недействителен.");
      if (request.consumed_at)
        throw new AppError(409, "TOKEN_USED", "Запрос уже использован.");
      if (request.expires_at.getTime() <= Date.now())
        throw new AppError(410, "TOKEN_EXPIRED", "Срок подтверждения истёк.");

      const account = await tx
        .selectFrom("account")
        .select(["password"])
        .where("userId", "=", userId)
        .where("providerId", "=", "credential")
        .executeTakeFirst();
      if (
        !account?.password ||
        !(await verifyPassword({ hash: account.password, password }))
      )
        throw new AppError(400, "PASSWORD_INCORRECT", "Пароль не подходит.");

      // Re-check ownership at confirm time (concurrency).
      const owned = await tx
        .selectFrom("business_member as m")
        .innerJoin("business as b", "b.id", "m.business_id")
        .select(["b.id", "b.public_id", "b.name"])
        .where("m.user_id", "=", userId)
        .where("m.role", "=", "owner")
        .where("m.status", "=", "active")
        .where("b.archived_at", "is", null)
        .execute();

      for (const biz of owned) {
        const decision = decisions.find((d) => d.businessId === biz.public_id);
        if (!decision)
          throw new AppError(
            400,
            "DECISION_REQUIRED",
            `Укажите действие для бизнеса «${biz.name}»: передать владение или удалить бизнес.`,
          );
        if (decision.action === "transfer") {
          await transferOwnership(tx, biz.id, userId, decision.transferToUserId);
        } else {
          // Full teardown: revoke members, disable solutions, clear TG/VK/Meta
          // credentials and release unique (platform, external_account_id).
          await archiveBusinessFully(tx, biz.id, userId);
        }
      }

      // Revoke remaining memberships (admin/operator and any leftover).
      const remaining = await tx
        .selectFrom("business_member")
        .select(["business_id"])
        .where("user_id", "=", userId)
        .where("status", "=", "active")
        .execute();
      for (const row of remaining) {
        await tx
          .updateTable("business_member")
          .set({ status: "revoked" })
          .where("business_id", "=", row.business_id)
          .where("user_id", "=", userId)
          .execute();
      }

      await tx
        .deleteFrom("notification_binding")
        .where("user_id", "=", userId)
        .execute();
      await tx
        .deleteFrom("notification_preference")
        .where("user_id", "=", userId)
        .execute();
      await tx.deleteFrom("account_pin").where("user_id", "=", userId).execute();
      await tx
        .deleteFrom("recovery_code")
        .where("user_id", "=", userId)
        .execute();

      const anonName = "Удалённый пользователь";
      const anonUsername = deletedUsername(user.public_id);
      const anonEmail = `deleted_${user.id.replace(/-/g, "")}@deleted.invalid`;

      await tx
        .updateTable("user")
        .set({
          name: anonName,
          username: anonUsername,
          deletion_status: "deleted",
          deleted_at: new Date(),
        })
        .where("id", "=", userId)
        .execute();

      await sql`
        update "user"
        set email = ${anonEmail},
            "emailVerified" = false,
            image = null,
            "displayUsername" = ${anonUsername},
            "updatedAt" = now()
        where id = ${userId}::uuid
      `.execute(tx);

      await tx
        .updateTable("account")
        .set({ password: null, updatedAt: new Date() })
        .where("userId", "=", userId)
        .where("providerId", "=", "credential")
        .execute();

      await tx.deleteFrom("session").where("userId", "=", userId).execute();

      await tx
        .updateTable("account_deletion_request")
        .set({
          consumed_at: new Date(),
          business_decisions: JSON.stringify(decisions),
        })
        .where("id", "=", request.id)
        .execute();

      await tx
        .insertInto("account_security_event")
        .values({
          id: randomUUID(),
          user_id: userId,
          action: "account_deletion_completed",
        })
        .execute();

      return { ok: true as const, alreadyDeleted: false };
    });
  }

  async cancelPending(userId: string) {
    return this.db.transaction().execute(async (tx) => {
      const user = await tx
        .selectFrom("user")
        .select(["deletion_status"])
        .where("id", "=", userId)
        .forUpdate()
        .executeTakeFirst();
      if (!user) return { ok: true };
      if (user.deletion_status === "deleted")
        throw new AppError(409, "ALREADY_DELETED", "Аккаунт уже удалён.");
      await tx
        .updateTable("account_deletion_request")
        .set({ consumed_at: new Date() })
        .where("user_id", "=", userId)
        .where("consumed_at", "is", null)
        .execute();
      if (user.deletion_status === "pending") {
        await tx
          .updateTable("user")
          .set({ deletion_status: "active" })
          .where("id", "=", userId)
          .execute();
      }
      return { ok: true as const };
    });
  }
}

function parseDecisions(raw: unknown): BusinessDecision[] {
  if (raw == null) return [];
  if (!Array.isArray(raw))
    throw new AppError(400, "INVALID_DECISIONS", "Некорректные решения по бизнесам.");
  return raw.map((item) => {
    if (!item || typeof item !== "object")
      throw new AppError(400, "INVALID_DECISIONS", "Некорректные решения по бизнесам.");
    const row = item as Record<string, unknown>;
    const businessId = String(row.businessId ?? "");
    const action = row.action;
    if (!/^biz_[a-f0-9]{20}$/.test(businessId))
      throw new AppError(400, "INVALID_DECISIONS", "Некорректный бизнес.");
    if (action !== "archive" && action !== "transfer")
      throw new AppError(400, "INVALID_DECISIONS", "Укажите archive или transfer.");
    return {
      businessId,
      action,
      transferToUserId:
        typeof row.transferToUserId === "string"
          ? row.transferToUserId
          : undefined,
    };
  });
}

async function transferOwnership(
  tx: Transaction<Database>,
  businessId: string,
  fromUserId: string,
  transferToPublicId: string | undefined,
) {
  if (!transferToPublicId || !/^usr_[a-f0-9]{20}$/.test(transferToPublicId))
    throw new AppError(
      400,
      "TRANSFER_TARGET_REQUIRED",
      "Выберите участника для передачи владения.",
    );
  const target = await tx
    .selectFrom("user")
    .select("id")
    .where("public_id", "=", transferToPublicId)
    .where("deletion_status", "=", "active")
    .executeTakeFirst();
  if (!target)
    throw new AppError(404, "USER_NOT_FOUND", "Получатель владения не найден.");
  if (target.id === fromUserId)
    throw new AppError(400, "INVALID_TRANSFER", "Нельзя передать владение себе.");

  const member = await tx
    .selectFrom("business_member")
    .select(["role", "status"])
    .where("business_id", "=", businessId)
    .where("user_id", "=", target.id)
    .forUpdate()
    .executeTakeFirst();
  if (!member || member.status !== "active")
    throw new AppError(
      400,
      "TRANSFER_NOT_MEMBER",
      "Получатель должен быть активным участником бизнеса.",
    );

  await tx
    .updateTable("business_member")
    .set({ role: "admin" })
    .where("business_id", "=", businessId)
    .where("user_id", "=", fromUserId)
    .where("role", "=", "owner")
    .execute();
  await tx
    .updateTable("business_member")
    .set({ role: "owner", status: "active" })
    .where("business_id", "=", businessId)
    .where("user_id", "=", target.id)
    .execute();
  await tx
    .updateTable("business_member")
    .set({ status: "revoked" })
    .where("business_id", "=", businessId)
    .where("user_id", "=", fromUserId)
    .execute();
}

