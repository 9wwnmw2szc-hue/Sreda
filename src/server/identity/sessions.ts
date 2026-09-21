import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import { AppError } from "../http/errors.ts";

export type SessionListItem = {
  id: string;
  current: boolean;
  createdAt: string;
  expiresAt: string;
  updatedAt: string;
};

export async function listSessions(
  db: Kysely<Database>,
  userId: string,
  currentSessionId: string,
): Promise<SessionListItem[]> {
  const rows = await db
    .selectFrom("session")
    .select(["id", "createdAt", "expiresAt", "updatedAt"])
    .where("userId", "=", userId)
    .where("expiresAt", ">", new Date())
    .orderBy("updatedAt", "desc")
    .limit(50)
    .execute();
  return rows.map((row) => ({
    id: row.id,
    current: row.id === currentSessionId,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function revokeOtherSessions(
  db: Kysely<Database>,
  userId: string,
  currentSessionId: string,
): Promise<{ revoked: number }> {
  const result = await db
    .deleteFrom("session")
    .where("userId", "=", userId)
    .where("id", "!=", currentSessionId)
    .executeTakeFirst();
  return { revoked: Number(result.numDeletedRows ?? 0) };
}

export async function revokeSession(
  db: Kysely<Database>,
  userId: string,
  currentSessionId: string,
  targetSessionId: string,
): Promise<{ ok: true }> {
  if (targetSessionId === currentSessionId)
    throw new AppError(
      400,
      "CURRENT_SESSION",
      "Текущую сессию завершите через выход из аккаунта.",
    );
  const deleted = await db
    .deleteFrom("session")
    .where("userId", "=", userId)
    .where("id", "=", targetSessionId)
    .executeTakeFirst();
  if (!Number(deleted.numDeletedRows ?? 0))
    throw new AppError(404, "SESSION_NOT_FOUND", "Сессия не найдена.");
  return { ok: true };
}
