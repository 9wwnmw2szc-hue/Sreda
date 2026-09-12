import { randomUUID } from "node:crypto";
import type { Kysely, Selectable } from "kysely";
import type { Database, Role } from "../db/schema.ts";
import { AppError } from "../http/errors.ts";

type InvitationRole = "admin" | "operator";
const publicId = /^usr_[a-f0-9]{20}$/;

export class InvitationService {
  constructor(private readonly db: Kysely<Database>, private readonly transactional = false) {}

  private async mutate<T>(businessPublicId: string, action: (service: InvitationService) => Promise<T>): Promise<T> {
    return this.db.transaction().execute(async (tx) => {
      // Every membership mutation locks the same business before checking permissions.
      await tx.selectFrom("business").select("id").where("public_id", "=", businessPublicId).forUpdate().execute();
      return action(new InvitationService(tx, true));
    });
  }

  private async audit(db: Kysely<Database>, businessId: string, actorUserId: string, action: Database["business_audit_log"]["action"], targetUserId: string | null, details?: string) {
    await db.insertInto("business_audit_log").values({ id: randomUUID(), business_id: businessId, actor_user_id: actorUserId, action, target_user_id: targetUserId, details: details ?? null }).execute();
  }

  private async business(userId: string, businessPublicId: string, role: Role = "owner") {
    const row = await this.db.selectFrom("business_member as member")
      .innerJoin("business", "business.id", "member.business_id")
      .select(["business.id", "member.role"])
      .where("business.public_id", "=", businessPublicId).where("member.user_id", "=", userId)
      .where("member.status", "=", "active").where("business.archived_at", "is", null).executeTakeFirst();
    if (!row) throw new AppError(404, "BUSINESS_NOT_FOUND", "Бизнес не найден.");
    if (row.role !== role) throw new AppError(403, "FORBIDDEN", "Недостаточно прав для управления участниками.");
    return row.id;
  }

  async create(inviterId: string, businessPublicId: string, targetPublicId: unknown, role: unknown): Promise<ReturnType<InvitationService["output"]>> {
    if (!this.transactional) return this.mutate(businessPublicId, (service) => service.create(inviterId, businessPublicId, targetPublicId, role));
    const businessId = await this.business(inviterId, businessPublicId);
    if (typeof targetPublicId !== "string" || !publicId.test(targetPublicId) || !["admin", "operator"].includes(String(role))) throw new AppError(400, "INVALID_INVITATION", "Проверьте ID пользователя и роль.");
    const target = await this.db.selectFrom("user").select("id").where("public_id", "=", targetPublicId).executeTakeFirst();
    if (!target) throw new AppError(404, "USER_NOT_FOUND", "Пользователь не найден.");
    if (target.id === inviterId) throw new AppError(400, "INVALID_INVITATION", "Нельзя пригласить самого себя.");
    const member = await this.db.selectFrom("business_member").select("user_id").where("business_id", "=", businessId).where("user_id", "=", target.id).where("status", "=", "active").executeTakeFirst();
    if (member) throw new AppError(409, "MEMBER_EXISTS", "Пользователь уже участвует в бизнесе.");
    await this.db.updateTable("business_invitation").set({ status: "expired", responded_at: new Date() }).where("business_id", "=", businessId).where("invitee_user_id", "=", target.id).where("status", "=", "pending").where("expires_at", "<=", new Date()).execute();
    const existing = await this.db.selectFrom("business_invitation").select("id").where("business_id", "=", businessId).where("invitee_user_id", "=", target.id).where("status", "=", "pending").where("expires_at", ">", new Date()).executeTakeFirst();
    if (existing) throw new AppError(409, "INVITATION_EXISTS", "Для этого пользователя уже есть приглашение.");
    const row = await this.db.insertInto("business_invitation").values({ id: randomUUID(), business_id: businessId, inviter_user_id: inviterId, invitee_user_id: target.id, role: role as InvitationRole, status: "pending", expires_at: new Date(Date.now() + 7 * 86400000), responded_at: null }).returningAll().executeTakeFirstOrThrow();
    await this.audit(this.db, businessId, inviterId, "invitation_created", target.id, String(role));
    return this.output(row, businessPublicId);
  }

  async list(userId: string, businessPublicId?: string) {
    const businessId = businessPublicId ? await this.business(userId, businessPublicId) : undefined;
    let query = this.db.selectFrom("business_invitation as invitation").innerJoin("business", "business.id", "invitation.business_id").select(["invitation.id", "invitation.role", "invitation.status", "invitation.expires_at as expiresAt", "invitation.created_at as createdAt", "business.public_id as businessId", "business.name as businessName"]).where("business.archived_at", "is", null).where("invitation.status", "=", "pending").where("invitation.expires_at", ">", new Date()).orderBy("invitation.created_at", "desc");
    query = businessId ? query.where("invitation.business_id", "=", businessId) : query.where("invitation.invitee_user_id", "=", userId);
    return query.execute();
  }

  async members(userId: string, businessPublicId: string) {
    const businessId = await this.business(userId, businessPublicId);
    return this.db.selectFrom("business_member as member").innerJoin("user", "user.id", "member.user_id")
      .select(["user.public_id as userId", "user.username", "user.name", "member.role", "member.created_at as joinedAt"])
      .where("member.business_id", "=", businessId).where("member.status", "=", "active")
      .orderBy("member.created_at").execute();
  }

  async revokeMember(ownerId: string, businessPublicId: string, targetPublicId: unknown): Promise<{ ok: boolean }> {
    if (!this.transactional) return this.mutate(businessPublicId, (service) => service.revokeMember(ownerId, businessPublicId, targetPublicId));
    const businessId = await this.business(ownerId, businessPublicId);
    if (typeof targetPublicId !== "string" || !publicId.test(targetPublicId)) throw new AppError(400, "INVALID_MEMBER", "Проверьте ID пользователя.");
    const target = await this.db.selectFrom("user").select("id").where("public_id", "=", targetPublicId).executeTakeFirst();
    if (!target) throw new AppError(404, "MEMBER_NOT_FOUND", "Участник не найден.");
    const changed = await this.db.updateTable("business_member").set({ status: "revoked" }).where("business_id", "=", businessId).where("user_id", "=", target.id).where("role", "!=", "owner").where("status", "=", "active").executeTakeFirst();
    if (!changed || Number(changed.numUpdatedRows) !== 1) throw new AppError(404, "MEMBER_NOT_FOUND", "Участник не найден.");
    await this.db.updateTable("business_invitation").set({ status: "revoked", responded_at: new Date() }).where("business_id", "=", businessId).where("invitee_user_id", "=", target.id).where("status", "=", "pending").execute();
    await this.audit(this.db, businessId, ownerId, "member_revoked", target.id);
    return { ok: true };
  }

  async changeRole(ownerId: string, businessPublicId: string, targetPublicId: unknown, role: unknown): Promise<{ ok: boolean }> {
    if (!this.transactional) return this.mutate(businessPublicId, (service) => service.changeRole(ownerId, businessPublicId, targetPublicId, role));
    const businessId = await this.business(ownerId, businessPublicId);
    if (typeof targetPublicId !== "string" || !publicId.test(targetPublicId) || !["admin", "operator"].includes(String(role))) throw new AppError(400, "INVALID_MEMBER", "Проверьте ID пользователя и роль.");
    const target = await this.db.selectFrom("user").select("id").where("public_id", "=", targetPublicId).executeTakeFirst();
    if (!target) throw new AppError(404, "MEMBER_NOT_FOUND", "Участник не найден.");
    const changed = await this.db.updateTable("business_member").set({ role: role as "admin" | "operator" }).where("business_id", "=", businessId).where("user_id", "=", target.id).where("role", "!=", "owner").where("status", "=", "active").executeTakeFirst();
    if (!changed || Number(changed.numUpdatedRows) !== 1) throw new AppError(404, "MEMBER_NOT_FOUND", "Участник не найден.");
    await this.audit(this.db, businessId, ownerId, "member_role_changed", target.id, String(role));
    return { ok: true };
  }

  async accept(userId: string, invitationId: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(invitationId)) throw new AppError(404, "INVITATION_NOT_FOUND", "Приглашение не найдено.");
    return this.db.transaction().execute(async (tx) => {
      const candidate = await tx.selectFrom("business_invitation").select("business_id").where("id", "=", invitationId).where("invitee_user_id", "=", userId).executeTakeFirst();
      if (!candidate) throw new AppError(404, "INVITATION_NOT_FOUND", "Приглашение не найдено.");
      const business = await tx.selectFrom("business").select(["id", "public_id"]).where("id", "=", candidate.business_id).where("archived_at", "is", null).forUpdate().executeTakeFirst();
      if (!business) throw new AppError(404, "INVITATION_NOT_FOUND", "Приглашение не найдено.");
      const invitation = await tx.selectFrom("business_invitation").selectAll().where("id", "=", invitationId).where("invitee_user_id", "=", userId).where("status", "=", "pending").executeTakeFirst();
      if (!invitation || invitation.expires_at <= new Date()) throw new AppError(404, "INVITATION_NOT_FOUND", "Приглашение не найдено.");
      await new InvitationService(tx, true).business(invitation.inviter_user_id, business.public_id);
      const member = await tx.selectFrom("business_member").select(["role", "status"]).where("business_id", "=", business.id).where("user_id", "=", userId).executeTakeFirst();
      if (member?.role === "owner" || member?.status === "active") throw new AppError(409, "MEMBER_EXISTS", "Пользователь уже участвует в бизнесе.");
      await tx.insertInto("business_member").values({ business_id: invitation.business_id, user_id: userId, role: invitation.role, status: "active" }).onConflict((oc) => oc.columns(["business_id", "user_id"]).doUpdateSet({ role: invitation.role, status: "active" })).execute();
      await tx.updateTable("business_invitation").set({ status: "accepted", responded_at: new Date() }).where("id", "=", invitation.id).execute();
      await this.audit(tx, invitation.business_id, userId, "invitation_accepted", userId, invitation.role);
      return { ok: true };
    });
  }

  async revoke(ownerId: string, businessPublicId: string, invitationId: string): Promise<{ ok: boolean }> {
    if (!this.transactional) return this.mutate(businessPublicId, (service) => service.revoke(ownerId, businessPublicId, invitationId));
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(invitationId)) throw new AppError(404, "INVITATION_NOT_FOUND", "Приглашение не найдено.");
    const businessId = await this.business(ownerId, businessPublicId);
    const changed = await this.db.updateTable("business_invitation").set({ status: "revoked", responded_at: new Date() }).where("id", "=", invitationId).where("business_id", "=", businessId).where("status", "=", "pending").executeTakeFirst();
    if (!changed || Number(changed.numUpdatedRows) !== 1) throw new AppError(404, "INVITATION_NOT_FOUND", "Приглашение не найдено.");
    const invitation = await this.db.selectFrom("business_invitation").select("invitee_user_id").where("id", "=", invitationId).executeTakeFirst();
    await this.audit(this.db, businessId, ownerId, "invitation_revoked", invitation?.invitee_user_id ?? null);
    return { ok: true };
  }

  async auditLog(userId: string, businessPublicId: string) {
    const businessId = await this.business(userId, businessPublicId, "admin").catch(async (error) => {
      if (error instanceof AppError && error.status === 403) return this.business(userId, businessPublicId, "owner");
      throw error;
    });
    return this.db.selectFrom("business_audit_log as log").innerJoin("user as actor", "actor.id", "log.actor_user_id").leftJoin("user as target", "target.id", "log.target_user_id").select(["log.id", "log.action", "log.details", "log.created_at as createdAt", "target.public_id as targetUserId", "actor.public_id as actorUserId", "actor.username as actorUsername"]).where("log.business_id", "=", businessId).orderBy("log.created_at", "desc").limit(100).execute();
  }

  private output(row: Selectable<Database["business_invitation"]>, businessId: string) { return { id: row.id, businessId, role: row.role, status: row.status, expiresAt: row.expires_at.toISOString(), createdAt: row.created_at.toISOString() }; }
}
