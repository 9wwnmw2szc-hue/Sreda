import { randomUUID } from 'node:crypto';
import type { Kysely, Transaction } from 'kysely';
import type { Database } from '../db/schema.ts';
import { AppError } from '../http/errors.ts';
import { requireBusiness } from '../access/permissions.ts';
type Identity = { kind:'telegram'|'vk'|'phone'|'email'; value:string; username?:string|null };
export function normalizeIdentity(identity: Identity): Identity {
 let value=identity.value.trim();
 if(identity.kind==='phone') { value=value.replace(/[\s().-]/g,''); if(!/^\+[1-9]\d{7,14}$/.test(value)) throw new AppError(400,'INVALID_PHONE','Укажите телефон в международном формате.'); }
 else if(identity.kind==='email') { value=value.toLowerCase(); if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)||value.length>254) throw new AppError(400,'INVALID_EMAIL','Проверьте email.'); }
 else if(!/^[1-9]\d{0,19}$/.test(value)) throw new AppError(400,'INVALID_IDENTITY','Некорректный идентификатор.');
 return {...identity,value};
}
export function clientInput(raw: Record<string,unknown>) {
 const name=typeof raw.name==='string'?raw.name.trim():'';
 if(!name||name.length>100||/[\u0000-\u001f]/.test(name))throw new AppError(400,'INVALID_CLIENT','Укажите имя до 100 символов.');
 const phone=raw.phone?normalizeIdentity({kind:'phone',value:String(raw.phone)}).value:null;
 const email=raw.email?normalizeIdentity({kind:'email',value:String(raw.email)}).value:null;
 return {name,phone,email};
}
/** Only trusted platform updates or verified contact proofs may provide identities. */
export async function matchClient(tx: Transaction<Database>, businessId: string, input: {name?:string;phone?:string|null;email?:string|null;identities:Identity[]}) {
 const business=await tx.selectFrom('business').select('id').where('id','=',businessId).where('archived_at','is',null).forUpdate().executeTakeFirst();
 if(!business)throw new AppError(404,'BUSINESS_NOT_FOUND','Бизнес не найден.');
 const identities=input.identities.map(normalizeIdentity);
 const ids=new Set<string>();
 for(const i of identities){const found=await tx.selectFrom('client_identity').select('client_id').where('business_id','=',businessId).where('kind','=',i.kind).where('value','=',i.value).executeTakeFirst();if(found)ids.add(found.client_id);}
 if(ids.size>1)throw new AppError(409,'CLIENT_IDENTITY_CONFLICT','Идентификаторы принадлежат разным клиентам. Требуется проверка сотрудником.');
 const id=[...ids][0]??randomUUID();const now=new Date();
 if(ids.size===0)await tx.insertInto('client').values({id,business_id:businessId,name:input.name?.trim().slice(0,100)||'Клиент',phone:input.phone??null,email:input.email??null}).execute();
 else await tx.updateTable('client').set({last_seen_at:now,updated_at:now,...(input.name?{name:input.name.trim().slice(0,100)}:{}),...(input.phone?{phone:input.phone}:{}),...(input.email?{email:input.email}:{})}).where('id','=',id).where('business_id','=',businessId).execute();
 for(const i of identities)await tx.insertInto('client_identity').values({business_id:businessId,client_id:id,kind:i.kind,value:i.value,username:i.username??null}).onConflict(oc=>oc.columns(['business_id','kind','value']).doUpdateSet({username:i.username??null})).execute();
 return id;
}
export async function clientActivity(tx: Transaction<Database>, businessId:string, clientId:string, type:string, eventKey:string,targetId:string|null=null,actorId:string|null=null){
 await tx.insertInto('client_activity').values({id:randomUUID(),business_id:businessId,client_id:clientId,type,event_key:eventKey,target_id:targetId,actor_user_id:actorId}).onConflict(oc=>oc.columns(['business_id','event_key']).doNothing()).execute();
}
export class ClientService {
 constructor(private db:Kysely<Database>){}
 async list(userId:string,publicId:string,search='',before?:string){
  const b=await requireBusiness(this.db,userId,publicId,'clients.read');
  let q=this.db.selectFrom('client as c').selectAll('c').where('c.business_id','=',b.id).orderBy('c.id').limit(100);
  if(search.length>100)throw new AppError(400,'INVALID_SEARCH','Слишком длинный запрос.');
  if(search)q=q.where(eb=>eb.or([eb('c.name','ilike','%'+search+'%'),eb('c.phone','ilike','%'+search+'%'),eb.exists(eb.selectFrom('client_identity as i').select('i.client_id').whereRef('i.client_id','=','c.id').whereRef('i.business_id','=','c.business_id').where('i.username','ilike','%'+search+'%'))]));
  if(before){if(!/^[0-9a-f-]{36}$/i.test(before))throw new AppError(400,'INVALID_CURSOR','Обновите список.');q=q.where('c.id','>',before);}
  return q.execute();
 }
 async detail(userId:string,publicId:string,id:string){
  const b=await requireBusiness(this.db,userId,publicId,'clients.read');
  if(!/^[0-9a-f-]{36}$/i.test(id))throw new AppError(404,'CLIENT_NOT_FOUND','Клиент не найден.');
  const client=await this.db.selectFrom('client').selectAll().where('business_id','=',b.id).where('id','=',id).executeTakeFirst();
  if(!client)throw new AppError(404,'CLIENT_NOT_FOUND','Клиент не найден.');
  const [identities,leads,conversations,activity,notes]=await Promise.all([
   this.db.selectFrom('client_identity').selectAll().where('business_id','=',b.id).where('client_id','=',id).execute(),
   this.db.selectFrom('lead').selectAll().where('business_id','=',b.id).where('client_id','=',id).orderBy('created_at','desc').limit(100).execute(),
   this.db.selectFrom('communication_conversation').selectAll().where('business_id','=',b.id).where('client_id','=',id).execute(),
   this.db.selectFrom('client_activity').selectAll().where('business_id','=',b.id).where('client_id','=',id).orderBy('created_at','desc').limit(100).execute(),
   this.db.selectFrom('client_note').selectAll().where('business_id','=',b.id).where('client_id','=',id).orderBy('created_at','desc').limit(100).execute()]);
  return {client,identities,leads,conversations,activity,notes};
 }
 async save(userId:string,publicId:string,raw:Record<string,unknown>,id?:string){
  const input=clientInput(raw);
  return this.db.transaction().execute(async tx=>{
   const b=await requireBusiness(tx,userId,publicId,'clients.write');
   if(id){const changed=await tx.updateTable('client').set({...input,updated_at:new Date()}).where('business_id','=',b.id).where('id','=',id).returning('id').executeTakeFirst();if(!changed)throw new AppError(404,'CLIENT_NOT_FOUND','Клиент не найден.');}
   else id=await matchClient(tx,b.id,{...input,identities:[]});
   await clientActivity(tx,b.id,id,'client.updated',randomUUID(),id,userId);return {id};
  });
 }
 async note(userId:string,publicId:string,id:string,value:unknown){
  if(typeof value!=='string'||!value.trim()||value.length>4000)throw new AppError(400,'INVALID_NOTE','Введите заметку до 4000 символов.');
  return this.db.transaction().execute(async tx=>{const b=await requireBusiness(tx,userId,publicId,'clients.write');const c=await tx.selectFrom('client').select('id').where('business_id','=',b.id).where('id','=',id).executeTakeFirst();if(!c)throw new AppError(404,'CLIENT_NOT_FOUND','Клиент не найден.');return tx.insertInto('client_note').values({id:randomUUID(),business_id:b.id,client_id:id,actor_user_id:userId,text:value.trim()}).returningAll().executeTakeFirstOrThrow();});
 }
}
