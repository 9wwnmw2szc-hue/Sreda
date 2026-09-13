import { getRuntime } from "@/server/runtime";
import { TelegramService } from "@/server/telegram/service";
import { json, readJson, respond } from "@/server/http/errors";
export const dynamic = "force-dynamic";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
 return respond(async()=>{
  const r=getRuntime();
  return json(await new TelegramService(r.db,r.secret,r.origin,r.telegramEnabled).receive((await params).id,request.headers.get("x-telegram-bot-api-secret-token")??"",await readJson(request,65536)));
 });
}
