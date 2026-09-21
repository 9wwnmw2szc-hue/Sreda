import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import { getEntitlement } from "../billing/entitlement.ts";

/** Call again under the business lock before enqueuing or sending. */
export async function autopostEnabled(
  db: Kysely<Database>,
  businessId: string,
) {
  const business = await db
    .selectFrom("business")
    .select("id")
    .where("id", "=", businessId)
    .where("archived_at", "is", null)
    .executeTakeFirst();
  if (!business) return false;
  const entitlement = await getEntitlement(db, businessId, "autopost");
  return entitlement.entitled;
}
