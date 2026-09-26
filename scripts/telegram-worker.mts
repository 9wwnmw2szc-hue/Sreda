import { preferIpv4Dns } from "../src/server/net/ipv4-first.ts";
import { queueNotification } from "../src/server/notifications/worker.ts";
import {
  queueScheduledPost,
  materializeRecurringPost,
} from "../src/server/posts/worker.ts";
import { queueBookingReminder } from "../src/server/booking/worker.ts";
import { processEntityReminder } from "../src/server/calendar/worker.ts";
import { processSetupDrafts } from "../src/server/solutions/setup-draft-worker.ts";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { TelegramService } from "../src/server/telegram/service.ts";
import { MetaChannelService } from "../src/server/meta/service.ts";
import { CommunicationService } from "../src/server/communications/service.ts";
import { runtimeConfig } from "../src/server/identity/config.ts";
import type { Database } from "../src/server/db/schema.ts";

preferIpv4Dns();
const config = runtimeConfig();
if (process.env.TELEGRAM_WEBHOOKS_ENABLED !== "true")
  throw new Error("Explicitly enable Telegram after deployment checks");
const db = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool: new Pool({ connectionString: config.databaseUrl, max: 3 }),
  }),
});
const service = new TelegramService(db, config.secret, config.origin, true);
const metaEnabled =
  process.env.META_WEBHOOKS_ENABLED === "true" ||
  process.env.WHATSAPP_WEBHOOKS_ENABLED === "true" ||
  process.env.INSTAGRAM_WEBHOOKS_ENABLED === "true";
const meta = new MetaChannelService(
  db,
  config.secret,
  metaEnabled,
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
      // Sole owner of shared scheduled work across Telegram/VK workers.
      await queueNotification(db, config.origin);
      await materializeRecurringPost(db);
      await queueScheduledPost(db);
      await db
        .insertInto("worker_heartbeat")
        .values({ name: "autopost", seen_at: new Date() })
        .onConflict((oc) =>
          oc.column("name").doUpdateSet({ seen_at: new Date() }),
        )
        .execute();
      const queued =
        (await queueBookingReminder(db)) || (await processEntityReminder(db));
      await processSetupDrafts(db);
      await db
        .insertInto("worker_heartbeat")
        .values({ name: "booking_reminders", seen_at: new Date() })
        .onConflict((oc) =>
          oc.column("name").doUpdateSet({ seen_at: new Date() }),
        )
        .execute();
      await db
        .insertInto("worker_heartbeat")
        .values({ name: "entity_reminders", seen_at: new Date() })
        .onConflict((oc) =>
          oc.column("name").doUpdateSet({ seen_at: new Date() }),
        )
        .execute();
      const metaWorked = metaEnabled ? await meta.deliverOne() : false;
      const worked = (await service.deliverOne()) || queued || metaWorked;
      if (Date.now() > nextCleanup) {
        // Dedup IDs carry no message text. Incomplete dialogues expire after one day.
        await db
          .deleteFrom("telegram_dialog")
          .where("updated_at", "<", new Date(Date.now() - 86400000))
          .execute();
        await db
          .deleteFrom("telegram_outbox")
          .where("delivered_at", "<", new Date(Date.now() - 86400000))
          .where("post_delivery_id", "is", null)
          .execute();
        if (metaEnabled)
          await db
            .deleteFrom("meta_outbox")
            .where("delivered_at", "<", new Date(Date.now() - 86400000))
            .execute();
        nextCleanup = Date.now() + 3600000;
      }
      if (!worked) await new Promise((r) => setTimeout(r, 1000));
    } catch {
      console.error(JSON.stringify({ code: "TELEGRAM_WORKER_ERROR" }));
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
} finally {
  await sql`delete from worker_heartbeat where name='telegram'`.execute(db);
  if (metaEnabled)
    await sql`delete from worker_heartbeat where name='meta_delivery'`.execute(
      db,
    );
  await db.destroy();
}
