import { before,after,test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Kysely,PGliteDialect } from 'kysely';
import { PGlite } from '@electric-sql/pglite';
import { migrate } from '../src/server/db/migrate.ts';
import { matchClient,normalizeIdentity,ClientService } from '../src/server/clients/service.ts';
import { allowed } from '../src/server/access/permissions.ts';
import { notify,NotificationService } from '../src/server/notifications/service.ts';
const db=new Kysely({dialect:new PGliteDialect({pglite:new PGlite()})});
before(()=>migrate(db,new URL('../migrations',import.meta.url).pathname));after(()=>db.destroy());
async function fixture(){const uid=randomUUID();await db.insertInto('user').values({id:uid,name:'Admin',email:uid+'@test.invalid',emailVerified:false,username:'u'+uid}).execute();const b=await db.insertInto('business').values({id:randomUUID(),name:'Business',timezone:'Europe/Kaliningrad'}).returningAll().executeTakeFirstOrThrow();await db.insertInto('business_member').values({business_id:b.id,user_id:uid,role:'owner',status:'active'}).execute();return {uid,b};}
test('platform identities match inside business; names and unverified phones never merge',async()=>{const {b}=await fixture();const {b:other}=await fixture();const resolve=(biz,input)=>db.transaction().execute(tx=>matchClient(tx,biz,input));const input={name:'Иван',phone:'+79991234567',identities:[{kind:'telegram',value:'101'}]};const id=await resolve(b.id,input);assert.equal(await resolve(b.id,input),id);assert.notEqual(await resolve(other.id,input),id);assert.notEqual(await resolve(b.id,{...input,identities:[]}),id);assert.notEqual(await resolve(b.id,{...input,identities:[{kind:'telegram',value:'102'}]}),id);});
test('conflicting verified identities roll back instead of merging clients',async()=>{const {b}=await fixture();await db.transaction().execute(tx=>matchClient(tx,b.id,{identities:[{kind:'telegram',value:'11'}]}));await db.transaction().execute(tx=>matchClient(tx,b.id,{identities:[{kind:'phone',value:'+79991234567'}]}));await assert.rejects(db.transaction().execute(tx=>matchClient(tx,b.id,{identities:[{kind:'telegram',value:'11'},{kind:'phone',value:'+79991234567'}]})),e=>e.code==='CLIENT_IDENTITY_CONFLICT');assert.equal((await db.selectFrom('client').selectAll().where('business_id','=',b.id).execute()).length,2);});
test('client notes scoped, notifications deduplicated and read state isolated',async()=>{const {uid,b}=await fixture();const other=await fixture();const svc=new ClientService(db);const {id}=await svc.save(uid,b.public_id,{name:'Иван'});await svc.note(uid,b.public_id,id,'Внутренняя заметка');await assert.rejects(svc.detail(other.uid,b.public_id,id),e=>e.code==='BUSINESS_NOT_FOUND');await db.transaction().execute(tx=>notify(tx,b.id,'lead.created','lead:1','Новая заявка','/leads'));await db.transaction().execute(tx=>notify(tx,b.id,'lead.created','lead:1','Новая заявка','/leads'));const ns=new NotificationService(db);const items=await ns.list(uid,b.public_id);assert.equal(items.length,1);assert.equal(items[0].read_at,null);await ns.read(uid,b.public_id,items[0].id);assert.ok((await ns.list(uid,b.public_id))[0].read_at);assert.equal((await svc.detail(uid,b.public_id,id)).notes.length,1);});
test('permissions and contact normalization',()=>{assert.equal(allowed('operator','connections.manage'),false);assert.equal(allowed('operator','booking.write'),true);assert.equal(allowed('admin','posts.manage'),true);assert.equal(normalizeIdentity({kind:'phone',value:'+7 (999) 123-45-67'}).value,'+79991234567');assert.throws(()=>normalizeIdentity({kind:'phone',value:'123'}));assert.throws(()=>normalizeIdentity({kind:'telegram',value:'-10'}));});

test('lead and conversation share a platform client; duplicate message leaves history unchanged',async()=>{
 const {CommunicationService}=await import('../src/server/communications/service.ts');const {createLead}=await import('../src/server/leads/service.ts');const {b}=await fixture();
 const lead=await db.transaction().execute(tx=>createLead(tx,b.id,{source:'telegram',name:'Анна',platformUserId:'222',externalEventId:'lead-event'}));
 const cs=new CommunicationService(db);const input={businessId:b.id,platform:'telegram',externalUserId:'222',text:'Уточните время',externalMessageId:'message-event'};
 await cs.recordInbound(input);await cs.recordInbound(input);
 const conversation=await db.selectFrom('communication_conversation').selectAll().where('business_id','=',b.id).executeTakeFirstOrThrow();assert.equal(conversation.client_id,lead.client_id);
 assert.equal((await db.selectFrom('client_activity').selectAll().where('business_id','=',b.id).execute()).length,2);
 assert.equal((await db.selectFrom('communication_message').selectAll().where('business_id','=',b.id).execute()).length,1);
});
