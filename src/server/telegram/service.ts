import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { sql, type Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import { AppError } from "../http/errors.ts";
import { decryptSecret } from "../connections/crypto.ts";
import { SolutionService, validateSetup } from "../solutions/service.ts";
import { telegramCall, TelegramError } from "./api.ts";
import { CommunicationService } from "../communications/service.ts";
const questions:Record<string,string>={name:"Как к вам обращаться?",phone:"Оставьте номер телефона для связи или напишите /skip.",service:"Что вас интересует? Можно пропустить: /skip.",comment:"Хотите что-нибудь добавить? Можно пропустить: /skip."};
export function webhookSecret(secret:string,id:string,generation:string){return createHmac("sha256",secret).update("telegram-webhook:"+id+":"+generation).digest("hex");}
export class TelegramService {
 constructor(private readonly db:Kysely<Database>,private readonly secret:string,private readonly origin:string,private readonly enabled:boolean,private readonly transport:typeof fetch=fetch,private readonly communications?:CommunicationService){}
 async start(userId:string,publicId:string){
  if(!this.enabled)throw new AppError(503,"TELEGRAM_DISABLED","Запуск Telegram станет доступен после подготовки сервера.");
  let affected: string | undefined;
  try { return await this.db.transaction().execute(async tx=>{
   const solutions=new SolutionService(tx,true);const businessId=await solutions.business(userId,publicId,true);
   await tx.selectFrom("business").select("id").where("id","=",businessId).forUpdate().execute();
   await solutions.business(userId,publicId,true);
   const {draft}=await solutions.get(userId,publicId);
   if(draft.step!==3||draft.channels.length!==1||draft.channels[0]!=="telegram")throw new AppError(400,"SETUP_REQUIRED","Завершите настройку с площадкой Telegram. Запуск VK появится отдельно.");
   const connection=await tx.selectFrom("business_connection as c").innerJoin("connection_secret as s","s.connection_id","c.id").select(["c.id","s.encrypted_token"]).where("c.business_id","=",businessId).where("c.platform","=","telegram").where("c.status","=","connected").executeTakeFirst();
   if(!connection)throw new AppError(400,"CONNECTION_REQUIRED","Сначала подключите Telegram-бота в разделе «Подключения».");
   affected=connection.id;
   await tx.deleteFrom("telegram_runtime").where("connection_id","=",connection.id).execute();
   const generation=randomUUID();
   await tx.insertInto("telegram_runtime").values({connection_id:connection.id,generation,status:"pending"}).execute();
   // Do not discard Telegram's pending updates. Failed DB commit leaves webhook
   // requests unacknowledged until configuration is retried with a new secret.
   await telegramCall(decryptSecret(connection.encrypted_token,this.secret),"setWebhook",{url:this.origin+"/api/telegram/"+connection.id,secret_token:webhookSecret(this.secret,connection.id,generation),allowed_updates:["message"],max_connections:1},this.transport);
   await tx.updateTable("telegram_runtime").set({status:"ready",updated_at:new Date()}).where("connection_id","=",connection.id).execute();
   return {ok:true};
  }); } catch(error) {
   // Telegram and PostgreSQL cannot share a transaction. Never keep a previous
   // ready flag after an uncertain remote update or local commit failure.
   if(affected) await this.db.updateTable("telegram_runtime").set({status:"error",updated_at:new Date()}).where("connection_id","=",affected).execute();
   throw error;
  }
 }
 async receive(id:string,provided:string,body:Record<string,unknown>){
  if(!this.enabled)throw new AppError(503,"TELEGRAM_DISABLED","Обработка сообщений временно недоступна.");
  if(!/^[a-f0-9-]{36}$/i.test(id))throw new AppError(404,"NOT_FOUND","Подключение не найдено.");
  return this.db.transaction().execute(async tx=>{
   const lookup=await tx.selectFrom("business_connection").select("business_id").where("id","=",id).executeTakeFirst();
   if(!lookup)throw new AppError(404,"NOT_FOUND","Подключение не найдено.");
   const business=await tx.selectFrom("business").select("id").where("id","=",lookup.business_id).where("archived_at","is",null).forUpdate().executeTakeFirst();
   const c=await tx.selectFrom("business_connection as c").innerJoin("telegram_runtime as r","r.connection_id","c.id").innerJoin("connection_secret as s","s.connection_id","c.id").select(["r.generation","r.status","c.external_account_id"]).where("c.id","=",id).where("c.status","=","connected").where("c.platform","=","telegram").executeTakeFirst();
   const expected=c?webhookSecret(this.secret,id,c.generation):"";
   if(!business||!c||!expected||!/^[a-f0-9]{64}$/.test(provided)||!timingSafeEqual(Buffer.from(provided),Buffer.from(expected)))throw new AppError(403,"INVALID_WEBHOOK","Запрос не подтверждён.");
   if(c.status!=="ready")throw new AppError(503,"CHANNEL_PAUSED","Обработка временно приостановлена.");
   if(!Number.isSafeInteger(body.update_id)||Number(body.update_id)<0)throw new AppError(400,"INVALID_UPDATE","Некорректное событие.");
   const updateId=String(body.update_id);
   const unique=await tx.insertInto("telegram_update").values({connection_id:id,update_id:updateId}).onConflict(oc=>oc.columns(["connection_id","update_id"]).doNothing()).returning("update_id").executeTakeFirst();
   if(!unique)return {ok:true};
   const m=body.message as {chat?:{id?:number;type?:string};from?:{id?:number;is_bot?:boolean;username?:string};text?:string}|undefined;
   if(m?.chat?.type!=="private"||!Number.isSafeInteger(m.chat.id)||m.from?.id!==m.chat.id||m.from?.is_bot||typeof m.text!=="string")return {ok:true};
   const chatId=String(m.chat.id);const text=m.text.trim();
   const queue=async(message:string)=>{await tx.insertInto("telegram_outbox").values({connection_id:id,chat_id:chatId,message,delivered_at:null,last_error:null}).execute();};
   if(this.communications){
    const communication=await this.communications.recordInboundInTransaction(tx,{businessId:business.id,platform:"telegram",externalUserId:chatId,externalUsername:m.from?.username?`@${m.from.username}`:null,text,externalMessageId:`${id}:${updateId}`});
    if(!communication.accepted){
     await queue(communication.reason==="quota"?"Лимит бесплатных сообщений на этот месяц исчерпан. Владелец бизнеса получил уведомление.":"Сообщения временно ограничены. Попробуйте позже.");
     return {ok:true};
    }
   }
   const dialog=await tx.selectFrom("telegram_dialog").selectAll().where("connection_id","=",id).where("chat_id","=",chatId).executeTakeFirst();
   if(dialog&&BigInt(updateId)<=BigInt(dialog.last_update_id))return {ok:true};
   const remove=async()=>{await tx.deleteFrom("telegram_dialog").where("connection_id","=",id).where("chat_id","=",chatId).execute();};
   const discardQueue=async()=>{await tx.deleteFrom("telegram_outbox").where("connection_id","=",id).where("chat_id","=",chatId).where("delivered_at","is",null).execute();};
   if(text==="/cancel"){await discardQueue();await remove();await queue("Заполнение заявки отменено. Если захотите начать снова, напишите /start.");return {ok:true};}
   if(text==="/start"||!dialog||dialog.updated_at.getTime()<Date.now()-86400000){
    const setup=await tx.selectFrom("lead_setup").select("draft").where("business_id","=",business.id).executeTakeFirstOrThrow();
    const fields=validateSetup(JSON.parse(setup.draft)).fields;
    await discardQueue();await remove();await tx.insertInto("telegram_dialog").values({connection_id:id,chat_id:chatId,fields:JSON.stringify(fields),answers:"{}",position:0,last_update_id:updateId}).execute();
    await queue("Здравствуйте! Это бот «Среды».\n\nОставьте заявку — мы зададим несколько коротких вопросов. В любой момент можно написать /cancel.\n\n"+questions[fields[0]!]);return {ok:true};
   }
   const fields=JSON.parse(dialog.fields) as string[];const field=fields[dialog.position]!;
   const max=field==="name"?100:field==="phone"?40:900;
   if(!text||text.length>max||(field==="name"&&text==="/skip")||(text.startsWith("/")&&text!=="/skip")||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)){
    await queue(`Введите ответ до ${max} символов. ${questions[field]}`);
    await tx.updateTable("telegram_dialog").set({last_update_id:updateId}).where("connection_id","=",id).where("chat_id","=",chatId).execute();return {ok:true};
   }
   const answers=JSON.parse(dialog.answers) as Record<string,string>;answers[field]=text==="/skip"?"":text;
   const next=dialog.position+1;
   if(next>=fields.length){
    await tx.insertInto("lead").values({id:randomUUID(),business_id:business.id,source:"telegram",name:answers.name!,phone:answers.phone||null,message:[answers.service,answers.comment].filter(Boolean).join("\n\n")||null,status:"new",external_event_id:c.external_account_id+":"+updateId}).onConflict(oc=>oc.columns(["business_id","source","external_event_id"]).doNothing()).execute();
    await remove();await queue("Спасибо! Ваша заявка принята. Мы передадим её сотрудникам компании и свяжемся с вами. Чтобы отправить новую заявку, напишите /start.");
   }else{
    await tx.updateTable("telegram_dialog").set({answers:JSON.stringify(answers),position:next,last_update_id:updateId,updated_at:new Date()}).where("connection_id","=",id).where("chat_id","=",chatId).execute();await queue(questions[fields[next]!]!);
   }
   return {ok:true};
  });
 }
 async deliverOne(){
  if(!this.enabled)return false;
  await this.db.insertInto("worker_heartbeat").values({name:"telegram",seen_at:new Date()}).onConflict(oc=>oc.column("name").doUpdateSet({seen_at:new Date()})).execute();
  const candidate=await this.db.selectFrom("telegram_outbox as o").innerJoin("business_connection as c","c.id","o.connection_id").innerJoin("telegram_runtime as r","r.connection_id","c.id").select(["o.id","c.business_id"]).where("o.delivered_at","is",null).where("o.attempts","<",8).where("o.available_at","<=",new Date()).where("r.status","=","ready").where(sql<boolean>`not exists(select 1 from telegram_outbox previous where previous.connection_id=o.connection_id and previous.chat_id=o.chat_id and previous.id<o.id and previous.delivered_at is null)`).orderBy("o.id").executeTakeFirst();
  if(!candidate)return false;
  return this.db.transaction().execute(async tx=>{
   const business=await tx.selectFrom("business").select("id").where("id","=",candidate.business_id).where("archived_at","is",null).forUpdate().skipLocked().executeTakeFirst();if(!business)return false;
   const row=await tx.selectFrom("telegram_outbox").selectAll().where("id","=",candidate.id).where("delivered_at","is",null).where("available_at","<=",new Date()).forUpdate().executeTakeFirst();if(!row)return false;
   const connection=await tx.selectFrom("connection_secret as s").innerJoin("telegram_runtime as r","r.connection_id","s.connection_id").innerJoin("business_connection as c","c.id","s.connection_id").select("s.encrypted_token").where("s.connection_id","=",row.connection_id).where("r.status","=","ready").where("c.status","=","connected").executeTakeFirst();if(!connection)return false;
   try{
    await telegramCall(decryptSecret(connection.encrypted_token,this.secret),"sendMessage",{chat_id:row.chat_id,text:row.message},this.transport);
    await tx.updateTable("telegram_outbox").set({delivered_at:new Date(),message:"",last_error:null}).where("id","=",row.id).execute();
   }catch(e){
    const failure=e instanceof TelegramError?e:new TelegramError();
    if(failure.chatUnavailable){
     // A recipient may block the bot. Cancel only that chat's pending work;
     // never pause every customer's channel or mark unsent replies delivered.
     await tx.deleteFrom("telegram_outbox").where("connection_id","=",row.connection_id).where("chat_id","=",row.chat_id).where("delivered_at","is",null).execute();
     await tx.deleteFrom("telegram_dialog").where("connection_id","=",row.connection_id).where("chat_id","=",row.chat_id).execute();
     return true;
    }
    const attempts=row.attempts+1;const exhausted=failure.permanent||attempts>=8;
    await tx.updateTable("telegram_outbox").set({attempts:exhausted?8:attempts,available_at:new Date(Date.now()+1000*Math.max(failure.retryAfter,Math.min(900,2**attempts))),last_error:failure.permanent?"PERMANENT":"RETRY"}).where("id","=",row.id).execute();
    if(exhausted)await tx.updateTable("telegram_runtime").set({status:"error",updated_at:new Date()}).where("connection_id","=",row.connection_id).execute();
   }
   return true;
  });
 }
}
