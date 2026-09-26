import { preferIpv4Dns } from "../src/server/net/ipv4-first.ts";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { VKService } from "../src/server/vk/service.ts";
import { CommunicationService } from "../src/server/communications/service.ts";
import { runtimeConfig } from "../src/server/identity/config.ts";
import type { Database } from "../src/server/db/schema.ts";

preferIpv4Dns();
const config = runtimeConfig();
if (process.env.VK_WEBHOOKS_ENABLED !== "true")
  throw new Error("Explicitly enable VK after deployment checks");
const db = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool: new Pool({ connectionString: config.databaseUrl, max: 3 }),
  }),
});
const service = new VKService(
  db,
  config.secret,
  true,
  new CommunicationService(db),
);
let stopping = false;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
let nextCleanup = 0;
try {
  while (!stopping) {
    try {
      // Shared scheduled jobs (notifications/posts/booking+entity reminders) are owned
      // exclusively by telegram-worker to avoid dual-loop contention. This worker only
      // delivers VK outbox rows and maintains the vk heartbeat.
      const worked = await service.deliverOne();
      await db
        .insertInto("worker_heartbeat")
        .values({ name: "vk", seen_at: new Date() })
        .onConflict((oc) =>
          oc.column("name").doUpdateSet({ seen_at: new Date() }),
        )
        .execute();
      if (Date.now() > nextCleanup) {
        await db
          .deleteFrom("vk_outbox")
          .where("delivered_at", "<", new Date(Date.now() - 86400000))
          .where("post_delivery_id", "is", null)
          .execute();
        nextCleanup = Date.now() + 3600000;
      }
      if (!worked) await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch {
      console.error(JSON.stringify({ code: "VK_WORKER_ERROR" }));
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
} finally {
  await sql`delete from worker_heartbeat where name='vk'`.execute(db);
  await db.destroy();
}
