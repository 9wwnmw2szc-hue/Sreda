import type { Transaction } from 'kysely';
import type { Database } from '../db/schema.ts';
import { validateSetup } from '../solutions/service.ts';
import { createLead } from '../leads/service.ts';
import { CommunicationService } from '../communications/service.ts';
import { normalizeIdentity } from '../clients/service.ts';
import type { LeadSetupDraft,LeadFieldId } from '../../lib/leadSetupDraft.ts';
const defaults:Record<string,string>={name:'Как к вам обращаться?',phone:'Ваш телефон',email:'Ваш email',message:'Ваше сообщение',service:'Что вас интересует?',comment:'Комментарий'};
export async function routeBot(tx:Transaction<Database>,input:{businessId:string;connectionId:string;platform:'telegram'|'vk';userId:string;username?:string;eventId:string;text:string}){
 const {businessId,connectionId,platform,userId,eventId}=input;const text=input.text.trim();
 const table=platform==='telegram'?'telegram_dialog':'vk_dialog';
 const b=await tx.selectFrom('business').selectAll().where('id','=',businessId).forUpdate().executeTakeFirstOrThrow();
 const active=await tx.selectFrom('business_solution').select('solution_code').where('business_id','=',businessId).where('status','in',['active','trial']).execute();
 const setup=await tx.selectFrom('lead_setup').select('draft').where('business_id','=',businessId).executeTakeFirst();
 const config=setup?validateSetup(JSON.parse(setup.draft)):undefined;
 const codes=new Set(active.map(x=>x.solution_code));if(config?.step===3)codes.add('leads');
 const menu=[...(codes.has('leads')&&config?.channels.includes(platform)?[config.title||'Оставить заявку']:[]),...(codes.has('admin_messages')?['Связаться с администрацией']:[]),...(codes.has('booking')?['Онлайн-запись']:[])];
 const queue=async(message:string,buttons:string[]=[])=>{const value={connection_id:connectionId,message,buttons:JSON.stringify(buttons),delivered_at:null,last_error:null};if(platform==='telegram')await tx.insertInto('telegram_outbox').values({...value,chat_id:userId}).execute();else await tx.insertInto('vk_outbox').values({...value,peer_id:userId}).execute();};
 const current=await tx.selectFrom(table).selectAll().where('connection_id','=',connectionId).where('chat_id','=',userId).executeTakeFirst();
 if(platform==='telegram'&&current&&BigInt(eventId)<=BigInt(current.last_update_id))return;
 const save=async(mode:string,fields:string[]=[],answers:Record<string,string>={},position=0,snapshot:LeadSetupDraft|Record<string,never>={})=>{const row={connection_id:connectionId,chat_id:userId,mode,fields:JSON.stringify(fields),answers:JSON.stringify(answers),position,config:JSON.stringify(snapshot),last_update_id:eventId,updated_at:new Date()};await tx.insertInto(table).values(row).onConflict(oc=>oc.columns(['connection_id','chat_id']).doUpdateSet(row)).execute();};
 const showMenu=async(message?:string)=>{await save('menu');await queue(message??((b.greeting||`Добро пожаловать в ${b.public_name||b.name}!`)+(menu.length?'\nВыберите действие.':'\nПриём обращений пока не настроен.')),menu);};
 if(text==='/start'||text==='/menu'||text==='Главное меню'){await showMenu();return;}
 if(text==='/cancel'||text==='Отмена'){await showMenu('Действие отменено. Выберите действие.');return;}
 if(text==='Связаться с администрацией'&&codes.has('admin_messages')){await save('messages');await queue('Напишите ваш вопрос.',['Главное меню']);return;}
 if(current?.mode==='messages'&&codes.has('admin_messages')){const result=await new CommunicationService(tx).recordInboundInTransaction(tx,{businessId,platform,externalUserId:userId,externalUsername:input.username,text,externalMessageId:connectionId+':'+eventId});if(result.accepted&&!result.duplicate)await queue('Сообщение отправлено. Администратор ответит вам здесь.',['Главное меню']);return;}
 const startLead=text===(config?.title||'Оставить заявку')||text==='/lead';
 const ask=(snapshot:LeadSetupDraft,field:string)=>{const option=snapshot.fieldOptions?.[field as LeadFieldId];return (option?.label||defaults[field]||field)+((field==='name'||option?.required)?'':'\nМожно пропустить: /skip.');};
 if(startLead&&config?.step===3&&config.channels.includes(platform)&&codes.has('leads')){const fields=['name',...config.fields.filter(x=>x!=='name')];await save('leads',fields,{},0,config);await queue((config.greeting||`Здравствуйте! Оставьте заявку в ${b.public_name||b.name}.`)+ '\n\n'+ask(config,fields[0]!),['Отмена']);return;}
 if(!current||!['leads','review'].includes(current.mode)||Date.now()-current.updated_at.getTime()>86400000){await showMenu();return;}
 const snapshot=JSON.parse(current.config) as LeadSetupDraft;const fields=JSON.parse(current.fields) as string[];const answers=JSON.parse(current.answers) as Record<string,string>;
 if(current.mode==='review'){
  if(text==='Изменить'){await save('leads',fields,{},0,snapshot);await queue(ask(snapshot,fields[0]!),['Отмена']);return;}
  if(text!=='Отправить'){await queue('Проверьте заявку и нажмите «Отправить».',['Отправить','Изменить','Отмена']);return;}
  await createLead(tx,businessId,{source:platform,name:answers.name!,phone:answers.phone||null,message:[answers.message,answers.service,answers.comment,answers.email].filter(Boolean).join('\n'),externalEventId:connectionId+':'+eventId,platformUserId:userId,username:input.username,answers});
  await save('menu');await queue(snapshot.finalMessage||'Спасибо! Ваша заявка принята. Мы скоро свяжемся с вами.',menu);return;
 }
 const field=fields[current.position]!;const required=field==='name'||snapshot.fieldOptions?.[field as LeadFieldId]?.required;
 if(!text||text.length>(field==='name'?100:900)||(text==='/skip'&&required)||(text.startsWith('/')&&text!=='/skip')){await queue('Проверьте ответ. '+ask(snapshot,field));return;}
 let answer=text==='/skip'?'':text;
 if(answer&&(field==='phone'||field==='email')){try{answer=normalizeIdentity({kind:field,value:answer}).value;}catch{await queue(field==='phone'?'Введите телефон в формате +79991234567.':'Проверьте email.');return;}}
 answers[field]=answer;const next=current.position+1;
 if(next<fields.length){await save('leads',fields,answers,next,snapshot);await queue(ask(snapshot,fields[next]!),['Отмена']);return;}
 await save('review',fields,answers,next,snapshot);await queue('Проверьте заявку:\n\n'+fields.map(f=>(snapshot.fieldOptions?.[f as LeadFieldId]?.label||defaults[f]||f)+': '+(answers[f]||'—')).join('\n'),['Отправить','Изменить','Отмена']);
}
