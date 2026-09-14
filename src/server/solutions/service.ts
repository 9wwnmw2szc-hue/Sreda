import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import { AppError } from "../http/errors.ts";
import { newLeadSetupDraft, LEAD_FIELDS, type LeadSetupDraft } from "../../lib/leadSetupDraft.ts";
import { SOLUTIONS } from "./catalog.ts";
import type { SolutionStatus } from "../../types/index.ts";
export function validateSetup(raw: unknown): LeadSetupDraft {
  const d = raw as LeadSetupDraft;
  if (!d || d.version !== 1 || !Number.isInteger(d.step) || d.step < 0 || d.step > 3 || !Array.isArray(d.channels) || !Array.isArray(d.fields)
    || d.channels.some((v) => !["telegram","vk"].includes(v)) || new Set(d.channels).size !== d.channels.length
    || d.fields.some((v) => !LEAD_FIELDS.some((f) => f.id === v)) || new Set(d.fields).size !== d.fields.length || !d.fields.includes("name")
    || (d.step > 0 && !d.channels.length)) throw new AppError(400,"INVALID_SETUP","Проверьте площадки и вопросы заявки.");
  return { version:1, step:d.step, channels:[...d.channels], fields:LEAD_FIELDS.filter((f)=>d.fields.includes(f.id)).map((f)=>f.id) };
}
export class SolutionService {
 constructor(private readonly db: Kysely<Database>, private readonly telegramEnabled = false) {}
 async business(userId:string,publicId:string,write=false) {
  const row=await this.db.selectFrom("business").innerJoin("business_member as m","m.business_id","business.id").select(["business.id","m.role"]).where("business.public_id","=",publicId).where("business.archived_at","is",null).where("m.user_id","=",userId).where("m.status","=","active").executeTakeFirst();
  if(!row) throw new AppError(404,"BUSINESS_NOT_FOUND","Бизнес не найден.");
  if(write && row.role==="operator") throw new AppError(403,"FORBIDDEN","Настройку меняют владелец и администратор.");
  return row.id;
 }
 async get(userId:string,publicId:string) {
  const id=await this.business(userId,publicId);
  const row=await this.db.selectFrom("lead_setup").selectAll().where("business_id","=",id).executeTakeFirst();
  return {draft:row?validateSetup(JSON.parse(row.draft)):newLeadSetupDraft(),revision:row?.revision??0};
 }
 async save(userId:string,publicId:string,body:Record<string,unknown>) {
  const draft=validateSetup(body.draft);
  if(!Number.isInteger(body.revision)||Number(body.revision)<0)throw new AppError(400,"INVALID_REVISION","Обновите настройку.");
  return this.db.transaction().execute(async tx=>{
   const id=await new SolutionService(tx).business(userId,publicId,true);
   await tx.selectFrom("business").select("id").where("id","=",id).forUpdate().execute();
   await new SolutionService(tx).business(userId,publicId,true);
   const current=await tx.selectFrom("lead_setup").selectAll().where("business_id","=",id).executeTakeFirst();
   if((current?.revision??0)!==body.revision)throw new AppError(409,"SETUP_CONFLICT","Настройка изменена в другой вкладке. Обновите страницу перед сохранением.");
   const revision=Number(body.revision)+1;
   await tx.insertInto("lead_setup").values({business_id:id,draft:JSON.stringify(draft),revision,updated_at:new Date()}).onConflict(oc=>oc.column("business_id").doUpdateSet({draft:JSON.stringify(draft),revision,updated_at:new Date()})).execute();
   // An edited configuration needs explicit restart; never silently change a running dialogue.
   const connections=await tx.selectFrom("business_connection").select("id").where("business_id","=",id).execute();
   for(const c of connections)await tx.deleteFrom("telegram_runtime").where("connection_id","=",c.id).execute();
   return {draft,revision};
  });
 }
 async list(userId:string,publicId:string) {
  const id=await this.business(userId,publicId);
  const setup=await this.get(userId,publicId);
  const enabledSolutions=await this.db.selectFrom("business_solution").select(["solution_code","status","expires_at"]).where("business_id","=",id).execute();
  const now=Date.now();
  const solutionState=new Map(enabledSolutions.map((item)=>[item.solution_code,{active:(item.status==="active"||item.status==="trial")&&(!item.expires_at||item.expires_at.getTime()>now),status:item.status}]));
  const runtime=await this.db.selectFrom("business_connection as c").innerJoin("telegram_runtime as r","r.connection_id","c.id").select("r.status").where("c.business_id","=",id).where("c.status","=","connected").where("c.platform","=","telegram").executeTakeFirst();
  const heartbeat=await this.db.selectFrom("worker_heartbeat").select("seen_at").where("name","=","telegram").executeTakeFirst();
  const healthy=heartbeat && heartbeat.seen_at.getTime()>Date.now()-60000;
  const active=!!healthy && this.telegramEnabled && setup.draft.step===3 && setup.draft.channels.length===1 && setup.draft.channels[0]==="telegram" && runtime?.status==="ready";
  const paused=setup.revision && (runtime?.status==="error" || runtime?.status==="ready"&&!healthy);
  const note=active?"Telegram подключён, обработчик отвечает.":!setup.revision||setup.draft.step!==3?"Завершите выбор площадок и вопросов.":setup.draft.channels.includes("vk")?"Запуск VK ещё недоступен. Для первого запуска выберите только Telegram.":!this.telegramEnabled?"Запуск сообщений станет доступен после подготовки сервера.":runtime?.status==="error"?"Отправка в Telegram приостановлена после ошибок. Проверьте токен и запустите сценарий повторно.":runtime?.status==="ready"&&!healthy?"Обработчик сообщений не отвечает. Требуется проверка сервера.":"Подключите Telegram-бота и запустите сценарий в настройке решения.";
  return SOLUTIONS.map((solution) => ({
    id: publicId + ":" + solution.code,
    businessId: publicId,
    solutionId: solution.id,
    status: (solution.code === "leads"
      ? active ? "active" : paused ? "paused" : setup.revision ? "setup_required" : "available"
      : solutionState.get(solution.code)?.active ? "active" : "unavailable") as SolutionStatus,
    note: solution.code === "leads"
      ? note
      : solutionState.get(solution.code)?.active
        ? "Решение подключено и доступно в универсальном боте."
        : "Подключите решение, чтобы добавить его функции в универсальный бот.",
  }));
 }
}
