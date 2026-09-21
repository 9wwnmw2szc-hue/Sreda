import { randomUUID } from "node:crypto";
import type { Transaction } from "kysely";
import type { Database } from "../db/schema.ts";

export type StaffNotifyPlatform = "telegram" | "vk";

/**
 * Staff push destinations must be an explicit User ↔ messenger identity claim.
 * Customer chats never become destinations by interacting with the bot.
 */
export async function claimStaffProviderIdentity(
  tx: Transaction<Database>,
  input: {
    userId: string;
    platform: StaffNotifyPlatform;
    externalUserId: string;
    displayName?: string | null;
  },
): Promise<{ ok: true } | { ok: false; reason: "IDENTITY_CONFLICT" }> {
  const existing = await tx
    .selectFrom("provider_identity")
    .selectAll()
    .where("platform", "=", input.platform)
    .where("external_user_id", "=", input.externalUserId)
    .forUpdate()
    .executeTakeFirst();

  if (existing) {
    if (existing.user_id !== input.userId)
      return { ok: false, reason: "IDENTITY_CONFLICT" };
    await tx
      .updateTable("provider_identity")
      .set({
        display_name: input.displayName ?? existing.display_name,
        revoked_at: null,
      })
      .where("id", "=", existing.id)
      .execute();
    return { ok: true };
  }

  const prior = await tx
    .selectFrom("provider_identity")
    .select("id")
    .where("user_id", "=", input.userId)
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

  await tx
    .insertInto("provider_identity")
    .values({
      id: randomUUID(),
      user_id: input.userId,
      platform: input.platform,
      external_user_id: input.externalUserId,
      display_name: input.displayName ?? null,
      username: null,
      revoked_at: null,
    })
    .execute();
  return { ok: true };
}

/** True only when chat_id is a verified staff messenger identity for this user. */
export async function hasVerifiedStaffIdentity(
  tx: Transaction<Database>,
  input: {
    userId: string;
    platform: StaffNotifyPlatform;
    chatId: string;
  },
) {
  const identity = await tx
    .selectFrom("provider_identity")
    .select("id")
    .where("user_id", "=", input.userId)
    .where("platform", "=", input.platform)
    .where("external_user_id", "=", input.chatId)
    .where("revoked_at", "is", null)
    .executeTakeFirst();
  return !!identity;
}
