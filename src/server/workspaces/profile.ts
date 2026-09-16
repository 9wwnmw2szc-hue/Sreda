import type { Kysely } from 'kysely';
import type { Database } from '../db/schema.ts';
import { requireBusiness } from '../access/permissions.ts';
import { parseBusiness } from './validation.ts';
import { AppError } from '../http/errors.ts';
export class BusinessProfileService {
 constructor(private db:Kysely<Database>){}
 async get(userId:string,publicId:string){const b=await requireBusiness(this.db,userId,publicId,'clients.read');return this.db.selectFrom('business').select(['name','public_name','greeting','description','contact_info','timezone']).where('id','=',b.id).executeTakeFirstOrThrow();}
 async save(userId:string,publicId:string,input:Record<string,unknown>){
  const base=parseBusiness({name:input.name,timezone:input.timezone});
  const optional=(key:string,max:number)=>{const value=input[key]??'';if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw new AppError(400,'INVALID_PROFILE','Проверьте поля профиля.');return value.trim();};
  const fields={...base,public_name:optional('public_name',100)||null,greeting:optional('greeting',2000),description:optional('description',4000),contact_info:optional('contact_info',2000)};
  return this.db.transaction().execute(async tx=>{const b=await requireBusiness(tx,userId,publicId,'settings.manage');await tx.selectFrom('business').select('id').where('id','=',b.id).forUpdate().execute();await requireBusiness(tx,userId,publicId,'settings.manage');await tx.updateTable('business').set(fields).where('id','=',b.id).execute();return fields;});
 }
}
