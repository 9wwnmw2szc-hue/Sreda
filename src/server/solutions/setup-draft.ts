import type { Kysely, Transaction } from "kysely";
import type { Database } from "../db/schema.ts";
import { normalizeSolutionCode } from "./catalog.ts";

type Db = Kysely<Database> | Transaction<Database>;

export async function cancelSetupDraft(
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
      updated_at: now,
      cancel_after: null,
    })
    .where("business_id", "=", businessId)
    .where("solution_code", "=", solutionCode)
    .where("status", "=", draft.status)
    .executeTakeFirst();
  if (!changed || Number(changed.numUpdatedRows) !== 1)
    return { ok: false as const };
  if (draft.previous_solution_status) {
    const restore =
      draft.previous_solution_status as Database["business_solution"]["status"];
    if (
      restore === "active" ||
      restore === "trial" ||
      restore === "expired" ||
      restore === "disabled" ||
      restore === "paused"
    ) {
      await db
        .insertInto("business_solution")
        .values({
          business_id: businessId,
          solution_code: solutionCode,
          status: restore,
          starts_at: now,
          expires_at: null,
        })
        .onConflict((oc) =>
          oc.columns(["business_id", "solution_code"]).doUpdateSet({
            status: restore,
            updated_at: now,
          }),
        )
        .execute();
    }
  }
  return { ok: true as const };
}
