import { queueScheduledPost,materializeRecurringPost } from "../src/server/posts/worker.ts";
import { queueBookingReminder } from "../src/server/booking/worker.ts";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { VKService } from "../src/server/vk/service.ts";
import { CommunicationService } from "../src/server/communications/service.ts";
import { runtimeConfig } from "../src/server/identity/config.ts";
import type { Database } from "../src/server/db/schema.ts";

const config = runtimeConfig();
if (process.env.VK_WEBHOOKS_ENABLED !== "true") throw new Error("Explicitly enable VK after deployment checks");
const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: config.databaseUrl, max: 3 }) }) });
const service = new VKService(db, config.secret, true, new CommunicationService(db));
let stopping = false;
process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });
let nextCleanup = 0;
try {
  while (!stopping) {
    try {
      await materializeRecurringPost(db);
   await queueScheduledPost(db);
   const queued=await queueBookingReminder(db);
      const worked = await service.deliverOne()||queued;
      if (Date.now() > nextCleanup) {
        await db.deleteFrom("vk_update").where("created_at", "<", new Date(Date.now() - 7 * 86400000)).execute();
        await db.deleteFrom("vk_outbox").where("delivered_at", "<", new Date(Date.now() - 86400000)).execute();
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
