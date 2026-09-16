import { AppError } from "../http/errors.ts";
export class TelegramError extends AppError {
 constructor(public retryAfter=0,public permanent=false,public chatUnavailable=false,public uncertain=false){super(503,"TELEGRAM_UNAVAILABLE","Telegram не подтвердил действие. Попробуйте позже.");}
}
export async function telegramCall(token:string,method:"sendMessage"|"setWebhook",body:Record<string,unknown>,transport:typeof fetch=fetch) {
 try {
  const response=await transport(`https://api.telegram.org/bot${encodeURIComponent(token)}/${method}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),redirect:"error",signal:AbortSignal.timeout(5000),cache:"no-store"});
  const data=await response.json().catch(()=>null) as {ok?:boolean;result?:{message_id?:number};parameters?:{retry_after?:number}}|null;
  if(!data)throw new TelegramError(0,false,false,true);
  if(!response.ok||!data?.ok)throw new TelegramError(Math.min(3600,Math.max(0,Number(data?.parameters?.retry_after)||0)),[400,401,403,404].includes(response.status),method==="sendMessage"&&response.status===403);
  return data.result;
 }catch(e){if(e instanceof TelegramError)throw e;throw new TelegramError(0,false,false,true);}
}
