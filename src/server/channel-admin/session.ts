import type { Kysely, Transaction } from "kysely";
import type { Database } from "../db/schema.ts";
import type { ChannelPlatform } from "./binding.ts";

export type ChannelAdminSessionDraft = Record<string, unknown>;

export type ChannelAdminSessionRow = {
  connectionId: string;
  externalUserId: string;
  platform: ChannelPlatform;
  userId: string;
  businessId: string;
  mode: string;
  step: string;
  draft: ChannelAdminSessionDraft;
  updatedAt: Date;
};

type Db = Kysely<Database> | Transaction<Database>;

function parseDraft(value: unknown): ChannelAdminSessionDraft {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        return parsed as ChannelAdminSessionDraft;
    } catch {
      return {};
    }
    return {};
  }
  if (typeof value === "object" && !Array.isArray(value))
    return value as ChannelAdminSessionDraft;
  return {};
}

export async function getChannelAdminSession(
  db: Db,
  connectionId: string,
  externalUserId: string,
  platform: ChannelPlatform,
): Promise<ChannelAdminSessionRow | null> {
  const row = await db
    .selectFrom("channel_admin_session")
    .selectAll()
    .where("connection_id", "=", connectionId)
    .where("external_user_id", "=", externalUserId)
    .where("platform", "=", platform)
    .executeTakeFirst();
  if (!row) return null;
  return {
    connectionId: row.connection_id,
    externalUserId: row.external_user_id,
    platform: row.platform,
    userId: row.user_id,
    businessId: row.business_id,
    mode: row.mode,
    step: row.step,
    draft: parseDraft(row.draft),
    updatedAt: row.updated_at,
  };
}

export async function setChannelAdminSession(
  db: Db,
  input: {
    connectionId: string;
    externalUserId: string;
    platform: ChannelPlatform;
    userId: string;
    businessId: string;
    mode?: string;
    step?: string;
    draft?: ChannelAdminSessionDraft;
  },
) {
  const mode = input.mode ?? "home";
  const step = input.step ?? "";
  const draft = input.draft ?? {};
  const row = {
    connection_id: input.connectionId,
    external_user_id: input.externalUserId,
    platform: input.platform,
    user_id: input.userId,
    business_id: input.businessId,
    mode,
    step,
    draft: JSON.stringify(draft),
    updated_at: new Date(),
  };
  await db
    .insertInto("channel_admin_session")
    .values(row)
    .onConflict((oc) =>
      oc
        .columns(["connection_id", "external_user_id", "platform"])
        .doUpdateSet({
          user_id: row.user_id,
          business_id: row.business_id,
          mode: row.mode,
          step: row.step,
          draft: row.draft,
          updated_at: row.updated_at,
        }),
    )
    .execute();
}

export async function clearChannelAdminSession(
  db: Db,
  connectionId: string,
  externalUserId: string,
  platform: ChannelPlatform,
) {
  await db
    .deleteFrom("channel_admin_session")
    .where("connection_id", "=", connectionId)
    .where("external_user_id", "=", externalUserId)
    .where("platform", "=", platform)
    .execute();
}

export async function patchChannelAdminSession(
  db: Db,
  connectionId: string,
  externalUserId: string,
  platform: ChannelPlatform,
  patch: {
    userId?: string;
    businessId?: string;
    mode?: string;
    step?: string;
    draft?: ChannelAdminSessionDraft;
  },
) {
  const current = await getChannelAdminSession(
    db,
    connectionId,
    externalUserId,
    platform,
  );
  if (!current) return null;
  await setChannelAdminSession(db, {
    connectionId,
    externalUserId,
    platform,
    userId: patch.userId ?? current.userId,
    businessId: patch.businessId ?? current.businessId,
    mode: patch.mode ?? current.mode,
    step: patch.step ?? current.step,
    draft: patch.draft ?? current.draft,
  });
  return getChannelAdminSession(db, connectionId, externalUserId, platform);
}
