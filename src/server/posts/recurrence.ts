import { AppError } from '../http/errors.ts';
import { dateOnly,localInstants } from '../booking/time.ts';
export type Recurrence={frequency:'daily'|'weekdays'|'weekly'|'monthly';start:string;time:string;end?:string;weekdays?:number[];timezone:string};
export function recurrence(raw:unknown):Recurrence{
 if(!raw||typeof raw!=='object')throw new AppError(400,'INVALID_RECURRENCE','Проверьте повторение публикации.');const r=raw as Recurrence;
 if(!['daily','weekdays','weekly','monthly'].includes(r.frequency)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.time))throw new AppError(400,'INVALID_RECURRENCE','Проверьте время публикации.');dateOnly(r.start);if(r.end){dateOnly(r.end);if(r.end<r.start)throw new AppError(400,'INVALID_RECURRENCE','Дата окончания раньше начала.');}
 try{new Intl.DateTimeFormat('ru',{timeZone:r.timezone});}catch{throw new AppError(400,'INVALID_TIMEZONE','Проверьте часовой пояс.');}
 if(r.frequency==='weekdays'&&(!Array.isArray(r.weekdays)||!r.weekdays.length||r.weekdays.some(d=>!Number.isInteger(d)||d<0||d>6)))throw new AppError(400,'INVALID_RECURRENCE','Выберите дни недели.');return {frequency:r.frequency,start:r.start,time:r.time,timezone:r.timezone,...(r.end?{end:r.end}:{}),...(r.weekdays?{weekdays:[...new Set(r.weekdays)]}:{})};
}
export function nextOccurrence(raw:Recurrence,after:Date):Date|null{
 const rule=recurrence(raw),start=new Date(rule.start+'T00:00:00Z');const afterDay=new Intl.DateTimeFormat('en-CA',{timeZone:rule.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(after);let date=rule.start>afterDay?rule.start:afterDay;const minute=Number(rule.time.slice(0,2))*60+Number(rule.time.slice(3));
 for(let n=0;n<400;n++){if(rule.end&&date>rule.end)return null;const d=new Date(date+'T00:00:00Z');const matches=rule.frequency==='daily'||rule.frequency==='weekdays'&&rule.weekdays!.includes(d.getUTCDay())||rule.frequency==='weekly'&&d.getUTCDay()===start.getUTCDay()||rule.frequency==='monthly'&&d.getUTCDate()===start.getUTCDate();if(matches){const first=localInstants(date,minute,rule.timezone)[0];if(first&&+first>+after)return first;}date=new Date(+d+86400000).toISOString().slice(0,10);}return null;
}
