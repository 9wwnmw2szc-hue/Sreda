import { randomUUID } from "node:crypto";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import { AppError } from "../http/errors.ts";

export async function changePassword(db: Kysely<Database>, userId: string, sessionId: string, body: Record<string, unknown>) {
  const { currentPassword, newPassword, passwordConfirmation } = body;
  if (typeof currentPassword !== "string" || currentPassword.length < 10 || currentPassword.length > 128 || typeof newPassword !== "string" || newPassword.length < 10 || newPassword.length > 128) throw new AppError(400, "INVALID_PASSWORD", "Пароль должен содержать от 10 до 128 символов.");
  if (newPassword !== passwordConfirmation) throw new AppError(400, "PASSWORD_MISMATCH", "Пароли не совпадают.");
  if (newPassword === currentPassword) throw new AppError(400, "PASSWORD_UNCHANGED", "Новый пароль должен отличаться от текущего.");
  return db.transaction().execute(async (tx) => {
    // Same lock as recovery: a concurrent reset cannot be overwritten using an old password.
    await tx.selectFrom("user").select("id").where("id", "=", userId).forUpdate().executeTakeFirstOrThrow();
    const session = await tx.selectFrom("session").select("id").where("id", "=", sessionId).where("userId", "=", userId).executeTakeFirst();
    if (!session) throw new AppError(401, "UNAUTHENTICATED", "Войдите в аккаунт.");
    const account = await tx.selectFrom("account").select("password").where("userId", "=", userId).where("providerId", "=", "credential").executeTakeFirst();
    if (!account?.password || !await verifyPassword({ hash: account.password, password: currentPassword })) throw new AppError(400, "PASSWORD_INCORRECT", "Текущий пароль не подходит.");
    await tx.updateTable("account").set({ password: await hashPassword(newPassword), updatedAt: new Date() }).where("userId", "=", userId).where("providerId", "=", "credential").execute();
    await tx.deleteFrom("session").where("userId", "=", userId).where("id", "!=", sessionId).execute();
    await tx.insertInto("account_security_event").values({ id: randomUUID(), user_id: userId, action: "password_changed" }).execute();
    return { ok: true };
  });
}
