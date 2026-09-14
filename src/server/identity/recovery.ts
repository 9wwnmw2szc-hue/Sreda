import { createHash, randomBytes, randomUUID } from "node:crypto";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import { AppError } from "../http/errors.ts";

const invalid = () => new AppError(400, "RECOVERY_FAILED", "Проверьте логин и резервный код. Код мог быть использован или заменён.");
function digest(userId: string, code: string) {
  // Random 128-bit codes do not need a password KDF. No dependency on a
  // rotatable session secret: changing that secret must not destroy recovery.
  return createHash("sha256").update(userId + ":" + code).digest("hex");
}
function password(value: unknown): string {
  if (typeof value !== "string" || value.length < 10 || value.length > 128) throw new AppError(400, "INVALID_PASSWORD", "Пароль должен содержать от 10 до 128 символов.");
  return value;
}

export class RecoveryService {
  constructor(private readonly db: Kysely<Database>) {}
  async status(userId: string) {
    const rows = await this.db.selectFrom("recovery_code").select(["used_at", "created_at"]).where("user_id", "=", userId).execute();
    return { remaining: rows.filter((row) => !row.used_at).length, issuedAt: rows[0]?.created_at.toISOString() ?? null };
  }
  async issue(userId: string, currentPassword: unknown) {
    const supplied = password(currentPassword);
    return this.db.transaction().execute(async (tx) => {
      const user = await tx.selectFrom("user").select("id").where("id", "=", userId).forUpdate().executeTakeFirst();
      if (!user) throw new AppError(401, "UNAUTHENTICATED", "Войдите в аккаунт.");
      const account = await tx.selectFrom("account").select("password").where("userId", "=", userId).where("providerId", "=", "credential").executeTakeFirst();
      if (!account?.password || !await verifyPassword({ hash: account.password, password: supplied })) throw new AppError(400, "PASSWORD_INCORRECT", "Текущий пароль не подходит.");
      const raw = Array.from({ length: 8 }, () => randomBytes(16).toString("hex"));
      await tx.deleteFrom("recovery_code").where("user_id", "=", userId).execute();
      await tx.insertInto("recovery_code").values(raw.map((code) => ({ user_id: userId, code_hash: digest(userId, code), used_at: null }))).execute();
      await tx.insertInto("account_security_event").values({ id: randomUUID(), user_id: userId, action: "recovery_codes_issued" }).execute();
      return { codes: raw.map((code) => code.match(/.{4}/g)!.join("-").toUpperCase()) };
    });
  }
  async recover(raw: Record<string, unknown>) {
    const newPassword = password(raw.newPassword);
    if (newPassword !== raw.passwordConfirmation) throw new AppError(400, "PASSWORD_MISMATCH", "Пароли не совпадают.");
    const username = typeof raw.username === "string" ? raw.username.trim().toLowerCase() : "";
    const code = typeof raw.recoveryCode === "string" && raw.recoveryCode.length <= 100 ? raw.recoveryCode.replace(/[\s-]/g, "").toLowerCase() : "";
    if (!/^[a-z0-9_.]{3,30}$/.test(username) || !/^[a-f0-9]{32}$/.test(code)) throw invalid();
    return this.db.transaction().execute(async (tx) => {
      const user = await tx.selectFrom("user").select("id").where("username", "=", username).forUpdate().executeTakeFirst();
      if (!user) throw invalid();
      const used = await tx.updateTable("recovery_code").set({ used_at: new Date() }).where("user_id", "=", user.id).where("code_hash", "=", digest(user.id, code)).where("used_at", "is", null).returning("user_id").executeTakeFirst();
      if (!used) throw invalid();
      const updated = await tx.updateTable("account").set({ password: await hashPassword(newPassword), updatedAt: new Date() }).where("userId", "=", user.id).where("providerId", "=", "credential").executeTakeFirst();
      if (Number(updated.numUpdatedRows) !== 1) throw invalid();
      await tx.deleteFrom("session").where("userId", "=", user.id).execute();
      await tx.deleteFrom("account_pin").where("user_id", "=", user.id).execute();
      await tx.insertInto("account_security_event").values({ id: randomUUID(), user_id: user.id, action: "password_recovered" }).execute();
      return { ok: true };
    });
  }
}
