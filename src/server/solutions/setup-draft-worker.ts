import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import { notify, resolveByEventKey } from "../notifications/service.ts";
import { cancelSetupDraft } from "./setup-draft.ts";
import { solutionByCode } from "./catalog.ts";

const DEFAULT_REMINDER_IDLE_MS = Number(
  process.env.SETUP_DRAFT_REMINDER_IDLE_MS ?? 86400000,
);
const DEFAULT_CANCEL_AFTER_MS = Number(
  process.env.SETUP_DRAFT_CANCEL_AFTER_MS ?? 86400000,
);

export type SetupDraftWorkerOptions = {
  reminderIdleMs?: number;
  cancelAfterMs?: number;
  now?: Date;
};

/** Process unfinished solution setup drafts: remind once, then cancel. */
export async function processSetupDrafts(
  db: Kysely<Database>,
  options: SetupDraftWorkerOptions = {},
) {
  return processBatch(db, options);
}

export async function processBatch(
  db: Kysely<Database>,
  options: SetupDraftWorkerOptions = {},
) {
  const reminderIdleMs = options.reminderIdleMs ?? DEFAULT_REMINDER_IDLE_MS;
  const cancelAfterMs = options.cancelAfterMs ?? DEFAULT_CANCEL_AFTER_MS;
  const now = options.now ?? new Date();
  const idleBefore = new Date(now.getTime() - reminderIdleMs);
  let reminded = 0;
  let cancelled = 0;

  const dueReminders = await db
    .selectFrom("solution_setup_draft")
    .select(["business_id", "solution_code"])
    .where("status", "=", "in_progress")
    .where("reminder_sent_at", "is", null)
    .where("last_activity_at", "<", idleBefore)
    .limit(50)
    .execute();

  for (const row of dueReminders) {
    const ok = await db.transaction().execute(async (tx) => {
      await tx
        .selectFrom("business")
        .select("id")
        .where("id", "=", row.business_id)
        .forUpdate()
        .executeTakeFirst();
      const cancelAfter = new Date(now.getTime() + cancelAfterMs);
      const changed = await tx
        .updateTable("solution_setup_draft")
        .set({
          status: "reminded",
          reminder_sent_at: now,
          cancel_after: cancelAfter,
          updated_at: now,
        })
        .where("business_id", "=", row.business_id)
        .where("solution_code", "=", row.solution_code)
        .where("status", "=", "in_progress")
        .where("reminder_sent_at", "is", null)
        .executeTakeFirst();
      if (!changed || Number(changed.numUpdatedRows) !== 1) return false;
      const title =
        solutionByCode(row.solution_code)?.title ?? row.solution_code;
      await notify(
        tx,
        row.business_id,
        "setup.abandoned",
        "setup:" + row.business_id + ":" + row.solution_code,
        "Незавершённая настройка: " + title,
        "/solutions",
      );
      return true;
    });
    if (ok) reminded += 1;
  }

  const dueCancels = await db
    .selectFrom("solution_setup_draft")
    .select(["business_id", "solution_code"])
    .where("status", "=", "reminded")
    .where("cancel_after", "is not", null)
    .where("cancel_after", "<", now)
    .limit(50)
    .execute();

  for (const row of dueCancels) {
    const ok = await db.transaction().execute(async (tx) => {
      await tx
        .selectFrom("business")
        .select("id")
        .where("id", "=", row.business_id)
        .forUpdate()
        .executeTakeFirst();
      const result = await cancelSetupDraft(
        tx,
        row.business_id,
        row.solution_code,
      );
      if (!result.ok) return false;
      await resolveByEventKey(
        tx,
        row.business_id,
        "setup:" + row.business_id + ":" + row.solution_code,
      );
      await tx
        .insertInto("business_audit_log")
        .values({
          id: randomUUID(),
          business_id: row.business_id,
          actor_user_id: null,
          action: "settings_changed",
          target_user_id: null,
          details: "setup_draft_cancelled:" + row.solution_code,
        })
        .execute();
      return true;
    });
    if (ok) cancelled += 1;
  }

  return { reminded, cancelled };
}
