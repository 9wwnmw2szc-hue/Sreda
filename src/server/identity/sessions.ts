import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import { AppError } from "../http/errors.ts";

export type SessionListItem = {
  id: string;
  current: boolean;
  createdAt: string;
  expiresAt: string;
  updatedAt: string;
  userAgent: string | null;
  deviceLabel: string;
};

/** Best-effort UA summary — never invent a specific phone model. */
export function summarizeUserAgent(ua: string | null | undefined): string {
  if (!ua || !ua.trim()) return "Неизвестное устройство";
  const raw = ua.trim();
  let browser = "Браузер";
  if (/Edg\//i.test(raw)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(raw)) browser = "Opera";
  else if (/Chrome\//i.test(raw) && !/Chromium/i.test(raw)) browser = "Chrome";
  else if (/Firefox\//i.test(raw)) browser = "Firefox";
  else if (/Safari\//i.test(raw) && !/Chrome\//i.test(raw)) browser = "Safari";

  let os = "";
  if (/iPhone/i.test(raw)) os = "iPhone";
  else if (/iPad/i.test(raw)) os = "iPad";
  else if (/Android/i.test(raw)) os = "Android";
  else if (/Windows NT/i.test(raw)) os = "Windows";
  else if (/Mac OS X|Macintosh/i.test(raw)) os = "macOS";
  else if (/Linux/i.test(raw)) os = "Linux";

  return os ? `${browser} · ${os}` : browser;
}

export async function listSessions(
  db: Kysely<Database>,
  userId: string,
  currentSessionId: string,
): Promise<SessionListItem[]> {
  const rows = await db
    .selectFrom("session")
    .select(["id", "createdAt", "expiresAt", "updatedAt", "userAgent"])
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
    userAgent: row.userAgent ?? null,
    deviceLabel: summarizeUserAgent(row.userAgent),
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
