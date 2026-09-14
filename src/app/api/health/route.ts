import { sql } from "kysely";
import { getRuntime } from "@/server/runtime";
export const dynamic = "force-dynamic";
export async function GET(){
 try {
  const r=getRuntime();await sql`select 1`.execute(r.db);
  for(const channel of (r.telegramEnabled?["telegram"]:[]).concat(r.vkEnabled?["vk"]:[])){const worker=await r.db.selectFrom("worker_heartbeat").select("seen_at").where("name","=",channel).executeTakeFirst();if(!worker||worker.seen_at.getTime()<Date.now()-60000)throw new Error("Worker unavailable");}
  return Response.json({ok:true},{headers:{"Cache-Control":"no-store"}});
 }catch{return Response.json({ok:false},{status:503,headers:{"Cache-Control":"no-store"}});}
}
