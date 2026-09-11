import { createHmac } from "node:crypto";
import { sql, type Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import { AppError } from "./errors.ts";

export async function limit(db: Kysely<Database>, secret: string, subject: string, max: number, seconds: number) {
  const key = createHmac("sha256", secret).update(subject).digest("hex");
  // Atomic fixed window, shared across server instances. No raw email/IP stored.
  const result = await sql<{ count: number }>`
    insert into request_limit (key, count, expires_at)
    values (${key}, 1, now() + ${seconds} * interval '1 second')
    on conflict (key) do update set
      count = case when request_limit.expires_at <= now() then 1 else request_limit.count + 1 end,
      expires_at = case when request_limit.expires_at <= now()
        then now() + ${seconds} * interval '1 second' else request_limit.expires_at end
    returning count
  `.execute(db);
  if (result.rows[0]!.count > max) throw new AppError(429, "RATE_LIMITED", "Слишком много попыток. Подождите и попробуйте снова.");
}
