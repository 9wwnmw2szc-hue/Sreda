import { queueBookingReminder } from "../src/server/booking/worker.ts";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { TelegramService } from "../src/server/telegram/service.ts";
import { runtimeConfig } from "../src/server/identity/config.ts";
import type { Database } from "../src/server/db/schema.ts";
const config=runtimeConfig();
if(process.env.TELEGRAM_WEBHOOKS_ENABLED!=="true")throw new Error("Explicitly enable Telegram after deployment checks");
const db=new Kysely<Database>({dialect:new PostgresDialect({pool:new Pool({connectionString:config.databaseUrl,max:3})})});
const service=new TelegramService(db,config.secret,config.origin,true);
let stopping=false;process.on("SIGTERM",()=>{stopping=true;});process.on("SIGINT",()=>{stopping=true;});
let nextCleanup=0;
try{
 while(!stopping){
  try{
   const queued=await queueBookingReminder(db);
   const worked=await service.deliverOne()||queued;
   if(Date.now()>nextCleanup){
    // Dedup IDs carry no message text. Incomplete dialogues expire after one day.
    await db.deleteFrom("telegram_dialog").where("updated_at","<",new Date(Date.now()-86400000)).execute();
    await db.deleteFrom("telegram_update").where("created_at","<",new Date(Date.now()-7*86400000)).execute();
    await db.deleteFrom("telegram_outbox").where("delivered_at","<",new Date(Date.now()-86400000)).execute();
    nextCleanup=Date.now()+3600000;
   }
   if(!worked)await new Promise(r=>setTimeout(r,1000));
  }catch{console.error(JSON.stringify({code:"TELEGRAM_WORKER_ERROR"}));await new Promise(r=>setTimeout(r,2000));}
 }
}finally{await sql`delete from worker_heartbeat where name='telegram'`.execute(db);await db.destroy();}
