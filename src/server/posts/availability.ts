import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
/** Call again under the business lock before enqueuing or sending. */
export async function autopostEnabled(
  db: Kysely<Database>,
  businessId: string,
) {
  return Boolean(
    await db
      .selectFrom("business_solution as s")
      .innerJoin("business as b", "b.id", "s.business_id")
      .select("b.id")
      .where("b.id", "=", businessId)
      .where("b.archived_at", "is", null)
      .where("s.solution_code", "=", "autopost")
      .where("s.status", "in", ["active", "trial"])
      .where((eb) =>
        eb.or([
          eb("s.expires_at", "is", null),
          eb("s.expires_at", ">", new Date()),
        ]),
      )
      .executeTakeFirst(),
  );
}
