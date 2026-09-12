import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";

export function loginCredential(db: Kysely<Database>, username: string) {
  return db.selectFrom("account").innerJoin("user", "user.id", "account.userId")
    .select(["account.userId", "account.password"])
    .where("user.username", "=", username).where("account.providerId", "=", "credential")
    .executeTakeFirst();
}

// Only release the new cookie if the credential used to begin this login is still
// current. Recovery/password change take this same user lock and delete sessions.
export async function acceptLogin(db: Kysely<Database>, before: Awaited<ReturnType<typeof loginCredential>>, token: string) {
  return db.transaction().execute(async (tx) => {
    const user = before && await tx.selectFrom("user").select("id").where("id", "=", before.userId).forUpdate().executeTakeFirst();
    const current = user && await tx.selectFrom("account").select("password").where("userId", "=", user.id).where("providerId", "=", "credential").executeTakeFirst();
    const session = user && await tx.selectFrom("session").select("id").where("userId", "=", user.id).where("token", "=", token).executeTakeFirst();
    if (before?.password && current?.password === before.password && session) return true;
    // Return false, do not throw here: revocation must commit before the HTTP error.
    await tx.deleteFrom("session").where("token", "=", token).execute();
    return false;
  });
}
