import type {Transaction} from 'kysely';
import type {Database} from '../db/schema.ts';
export async function cancelConnectionDeliveries(tx:Transaction<Database>,connectionId:string){
 for(const table of ['telegram_outbox','vk_outbox'] as const){const pending=await tx.selectFrom(table).select(['communication_message_id','booking_reminder_id']).where('connection_id','=',connectionId).where('delivered_at','is',null).execute();for(const row of pending){if(row.communication_message_id)await tx.updateTable('communication_message').set({delivery_status:'failed'}).where('id','=',row.communication_message_id).execute();if(row.booking_reminder_id)await tx.updateTable('booking_reminder').set({status:'failed',last_error:'CONNECTION_REMOVED'}).where('id','=',row.booking_reminder_id).execute();}}
}
