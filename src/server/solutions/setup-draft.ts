import type { Kysely, Transaction } from "kysely";
import type { Database } from "../db/schema.ts";
import { resolveByEventKey } from "../notifications/service.ts";
import { normalizeSolutionCode } from "./catalog.ts";

type Db = Kysely<Database> | Transaction<Database>;

export type CancelSetupDraftMode = "user_cancel" | "auto_expire";

export async function resolveSetupNotifications(
  tx: Db,
  businessId: string,
  code: string,
) {
  const solutionCode = normalizeSolutionCode(code);
  await resolveByEventKey(
    tx,
    businessId,
    "setup:" + businessId + ":" + solutionCode,
  );
}

/** Cancel an open setup draft without changing business_solution status. */
export async function clearOpenSetupDraft(
  db: Db,
  businessId: string,
  code: string,
) {
  const solutionCode = normalizeSolutionCode(code);
  const draft = await db
    .selectFrom("solution_setup_draft")
    .selectAll()
    .where("business_id", "=", businessId)
    .where("solution_code", "=", solutionCode)
    .executeTakeFirst();
  if (
    !draft ||
    (draft.status !== "in_progress" && draft.status !== "reminded")
  )
    return { ok: false as const };
  const now = new Date();
  const changed = await db
    .updateTable("solution_setup_draft")
    .set({
      status: "cancelled",
      draft: {},
      updated_at: now,
      cancel_after: null,
    })
    .where("business_id", "=", businessId)
    .where("solution_code", "=", solutionCode)
    .where("status", "=", draft.status)
    .executeTakeFirst();
  if (!changed || Number(changed.numUpdatedRows) !== 1)
    return { ok: false as const };
  await resolveSetupNotifications(db, businessId, solutionCode);
  return { ok: true as const };
}

export async function cancelSetupDraft(
  db: Db,
  businessId: string,
  code: string,
  options: { mode: CancelSetupDraftMode } = { mode: "auto_expire" },
) {
  const solutionCode = normalizeSolutionCode(code);
  const draft = await db
    .selectFrom("solution_setup_draft")
    .selectAll()
    .where("business_id", "=", businessId)
    .where("solution_code", "=", solutionCode)
    .executeTakeFirst();
  if (
    !draft ||
    (draft.status !== "in_progress" && draft.status !== "reminded")
  )
    return { ok: false as const };
  const now = new Date();
  const changed = await db
    .updateTable("solution_setup_draft")
    .set({
      status: "cancelled",
      draft: options.mode === "user_cancel" ? {} : draft.draft,
      updated_at: now,
      cancel_after: null,
    })
    .where("business_id", "=", businessId)
    .where("solution_code", "=", solutionCode)
    .where("status", "=", draft.status)
    .executeTakeFirst();
  if (!changed || Number(changed.numUpdatedRows) !== 1)
    return { ok: false as const };

  if (options.mode === "user_cancel") {
    await db
      .insertInto("business_solution")
      .values({
        business_id: businessId,
        solution_code: solutionCode,
        status: "disabled",
        starts_at: now,
        expires_at: null,
        disabled_at: now,
        paused_at: null,
      })
      .onConflict((oc) =>
        oc.columns(["business_id", "solution_code"]).doUpdateSet({
          status: "disabled",
          disabled_at: now,
          paused_at: null,
          updated_at: now,
        }),
      )
      .execute();
    await resolveSetupNotifications(db, businessId, solutionCode);
    return { ok: true as const, mode: "user_cancel" as const };
  }

  // auto_expire: restore previous active/trial/paused; else disable
  const restore =
    draft.previous_solution_status as
      | Database["business_solution"]["status"]
      | null
      | undefined;
  if (restore === "active" || restore === "trial" || restore === "paused") {
    await db
      .insertInto("business_solution")
      .values({
        business_id: businessId,
        solution_code: solutionCode,
        status: restore,
        starts_at: now,
        expires_at: null,
        disabled_at: null,
        paused_at: restore === "paused" ? now : null,
      })
      .onConflict((oc) =>
        oc.columns(["business_id", "solution_code"]).doUpdateSet({
          status: restore,
          disabled_at: null,
          paused_at: restore === "paused" ? now : null,
          updated_at: now,
        }),
      )
      .execute();
  } else {
    await db
      .insertInto("business_solution")
      .values({
        business_id: businessId,
        solution_code: solutionCode,
        status: "disabled",
        starts_at: now,
        expires_at: null,
        disabled_at: now,
        paused_at: null,
      })
      .onConflict((oc) =>
        oc.columns(["business_id", "solution_code"]).doUpdateSet({
          status: "disabled",
          disabled_at: now,
          paused_at: null,
          updated_at: now,
        }),
      )
      .execute();
  }
  return { ok: true as const, mode: "auto_expire" as const };
}
