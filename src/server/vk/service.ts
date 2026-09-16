import { reminderValid } from "../booking/worker.ts";
import { claimDelivery,expireClaims } from "../outbox/claim.ts";
import { routeBot } from "../bot/router.ts";
import { createHmac, timingSafeEqual } from "node:crypto";
import { sql, type Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import { AppError } from "../http/errors.ts";
import { CommunicationService } from "../communications/service.ts";
import { decryptSecret } from "../connections/crypto.ts";
import { vkCall, VKError } from "./api.ts";

type VKMessage = { date?: number; from_id?: number; peer_id?: number; text?: string; conversation_message_id?: number };

export function callbackSecret(secret: string, connectionId: string, generation: string) {
  return createHmac("sha256", secret).update("vk-callback:" + connectionId + ":" + generation).digest("hex");
}

export class VKService {
  constructor(private readonly db: Kysely<Database>, private readonly secret: string, private readonly enabled: boolean, private readonly communications?: CommunicationService, private readonly transport: typeof fetch = fetch) {}

  async receive(id: string, body: Record<string, unknown>) {
    if (!this.enabled) throw new AppError(503, "VK_DISABLED", "Обработка VK временно недоступна.");
    if (!/^[a-f0-9-]{36}$/i.test(id)) throw new AppError(404, "NOT_FOUND", "Подключение не найдено.");
    return this.db.transaction().execute(async (tx) => {
      const runtime = await tx.selectFrom("vk_runtime as r")
        .innerJoin("business_connection as c", "c.id", "r.connection_id")
        .select(["r.generation", "r.status", "c.business_id", "c.status as connectionStatus", "c.platform"])
        .where("r.connection_id", "=", id)
        .executeTakeFirst();
      const provided = typeof body.secret === "string" ? body.secret : "";
      const expected = runtime ? callbackSecret(this.secret, id, runtime.generation) : "";
      const validSecret = /^[a-f0-9]{64}$/.test(provided) && /^[a-f0-9]{64}$/.test(expected) && timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
      if (!runtime || runtime.platform !== "vk" || runtime.connectionStatus !== "connected" || runtime.status !== "ready" || !validSecret) throw new AppError(403, "INVALID_WEBHOOK", "Запрос не подтверждён.");
      const type = body.type;
      if (type === "confirmation") return { type: "confirmation", ok: true };
      if (type !== "message_new") return { ok: true };
      const eventId = typeof body.event_id === "string" ? body.event_id : "";
      if (!eventId || eventId.length > 200) throw new AppError(400, "INVALID_EVENT", "Некорректное событие VK.");
      const unique = await tx.insertInto("vk_update").values({ connection_id: id, event_id: eventId }).onConflict((oc) => oc.columns(["connection_id", "event_id"]).doNothing()).returning("event_id").executeTakeFirst();
      if (!unique) return { ok: true, duplicate: true };
      const object=body.object as {message?:VKMessage}|undefined;
      const message = object?.message ?? body.object as VKMessage | undefined;
      if (!message || typeof message.from_id !== "number" || typeof message.peer_id !== "number" || !Number.isSafeInteger(message.from_id) || !Number.isSafeInteger(message.peer_id) || typeof message.text !== "string" || message.from_id <= 0 || message.peer_id <= 0) return { ok: true };
      await routeBot(tx,{businessId:runtime.business_id,connectionId:id,platform:'vk',userId:String(message.from_id),eventId,text:message.text});
      return { ok: true, accepted: true };
    });
  }

  async deliverOne() {
    if (!this.enabled) return false;
    await this.db.insertInto("worker_heartbeat").values({ name: "vk", seen_at: new Date() }).onConflict((oc) => oc.column("name").doUpdateSet({ seen_at: new Date() })).execute();
  await expireClaims(this.db,"vk");
    const candidate = await this.db.selectFrom("vk_outbox as o")
      .innerJoin("business_connection as c", "c.id", "o.connection_id")
      .innerJoin("vk_runtime as r", "r.connection_id", "c.id")
      .select(["o.id", "c.business_id"])
      .where("o.delivery_state", "=", "pending").where("o.delivered_at", "is", null).where("o.attempts", "<", 8).where("o.available_at", "<=", new Date())
      .where("r.status", "=", "ready").where("c.status", "=", "connected")
      .where(sql<boolean>`not exists(select 1 from vk_outbox previous where previous.connection_id=o.connection_id and previous.peer_id=o.peer_id and previous.id<o.id and previous.delivered_at is null and previous.delivery_state in ('pending','sending'))`)
      .orderBy("o.id").executeTakeFirst();
    if (!candidate) return false;
  if(!await claimDelivery(this.db,"vk",candidate.id))return false;
    return this.db.transaction().execute(async (tx) => {
      const business = await tx.selectFrom("business").select("id").where("id", "=", candidate.business_id).where("archived_at", "is", null).forUpdate().executeTakeFirst();
      if (!business) return false;
      const row = await tx.selectFrom("vk_outbox").selectAll().where("id", "=", candidate.id).where("delivery_state", "=", "sending").where("delivered_at", "is", null).where("available_at", "<=", new Date()).forUpdate().executeTakeFirst();
      if (!row) return false;
      const connection = await tx.selectFrom("connection_secret as s").innerJoin("vk_runtime as r", "r.connection_id", "s.connection_id").innerJoin("business_connection as c", "c.id", "s.connection_id").select(["s.encrypted_token", "r.generation"]).where("s.connection_id", "=", row.connection_id).where("r.status", "=", "ready").where("c.status", "=", "connected").executeTakeFirst();
      if (!connection) return false;
   if(row.booking_reminder_id&&!await reminderValid(tx,row.booking_reminder_id)){await tx.updateTable('vk_outbox').set({delivery_state:'failed',last_error:'STALE_REMINDER'}).where('id','=',row.id).execute();return true;}
      try {
        // Keep random_id stable across retries so VK deduplicates a response
        // when the network fails after the platform accepted the message.
        const randomId = Number(BigInt(String(row.id)) % BigInt(2_147_483_647));
        const delivered=await vkCall(decryptSecret(connection.encrypted_token, this.secret), "messages.send", { peer_id: row.peer_id, random_id: randomId, message: row.message, keyboard: JSON.stringify({one_time:false,buttons:(row.buttons as string[]).slice(0,10).map(label=>[{action:{type:"text",label},color:"secondary"}])}) }, this.transport);
        await tx.updateTable("vk_outbox").set({ delivery_state:"sent",external_message_id:String(delivered),delivered_at: new Date(), message: "", last_error: null }).where("id", "=", row.id).execute();
    if(row.booking_reminder_id)await tx.updateTable('booking_reminder').set({status:'sent'}).where('id','=',row.booking_reminder_id).execute();
        if(row.communication_message_id)await tx.updateTable("communication_message").set({delivery_status:"sent",external_message_id:String(delivered)}).where("id","=",row.communication_message_id).execute();
      } catch (error) {
        if(!(error instanceof VKError))throw error;
        const failure=error;
        if(failure.uncertain){await tx.updateTable('vk_outbox').set({delivery_state:'uncertain',last_error:'DELIVERY_UNKNOWN'}).where('id','=',row.id).execute();if(row.communication_message_id)await tx.updateTable('communication_message').set({delivery_status:'uncertain'}).where('id','=',row.communication_message_id).execute();return true;}
        if (failure.chatUnavailable) {
          await tx.deleteFrom("vk_outbox").where("connection_id", "=", row.connection_id).where("peer_id", "=", row.peer_id).where("delivered_at", "is", null).execute();
          return true;
        }
        const attempts = row.attempts + 1;
        const exhausted = failure.permanent || attempts >= 8;
        await tx.updateTable("vk_outbox").set({ delivery_state:exhausted?"failed":"pending",claimed_at:null,attempts: exhausted ? 8 : attempts, available_at: new Date(Date.now() + 1000 * Math.max(failure.retryAfter, Math.min(900, 2 ** attempts))), last_error: failure.permanent ? "PERMANENT" : "RETRY" }).where("id", "=", row.id).execute();
        if (exhausted) await tx.updateTable("vk_runtime").set({ status: "error", updated_at: new Date() }).where("connection_id", "=", row.connection_id).execute();
      }
      return true;
    });
  }
}
