import {S3Client,PutObjectCommand,GetObjectCommand,DeleteObjectCommand} from '@aws-sdk/client-s3';
import {mkdir,readFile,writeFile,unlink} from 'node:fs/promises';import {isAbsolute,join} from 'node:path';import {AppError} from '../http/errors.ts';
export const MAX_ATTACHMENT=50*1024*1024;
export interface AttachmentStorage{put(key:string,bytes:Uint8Array,mime:string):Promise<void>;get(key:string):Promise<Uint8Array>;remove(key:string):Promise<void>}
function keyCheck(key:string){if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(key))throw new Error('Invalid storage key');}
export class FileAttachmentStorage implements AttachmentStorage{constructor(private root:string){if(!isAbsolute(root))throw new Error('Storage path must be absolute');}async put(key:string,bytes:Uint8Array){keyCheck(key);await mkdir(join(this.root,key.split('/')[0]!),{recursive:true,mode:0o700});await writeFile(join(this.root,key),bytes,{mode:0o600,flag:'wx'});}async get(key:string){keyCheck(key);return readFile(join(this.root,key));}async remove(key:string){keyCheck(key);await unlink(join(this.root,key)).catch(()=>{});}}
export class S3AttachmentStorage implements AttachmentStorage{
 constructor(private client:S3Client,private bucket:string){}
 async put(key:string,bytes:Uint8Array,mime:string){keyCheck(key);await this.client.send(new PutObjectCommand({Bucket:this.bucket,Key:key,Body:bytes,ContentType:mime}),{abortSignal:AbortSignal.timeout(60000)});}
 async get(key:string){keyCheck(key);const result=await this.client.send(new GetObjectCommand({Bucket:this.bucket,Key:key}),{abortSignal:AbortSignal.timeout(60000)});if(!result.Body||(result.ContentLength??0)>MAX_ATTACHMENT)throw new AppError(413,'FILE_TOO_LARGE','Файл превышает 50 МБ.');const reader=result.Body.transformToWebStream().getReader();return readLimited(reader);}
 async remove(key:string){keyCheck(key);await this.client.send(new DeleteObjectCommand({Bucket:this.bucket,Key:key}),{abortSignal:AbortSignal.timeout(10000)});}
}
export async function readLimited(reader:ReadableStreamDefaultReader<Uint8Array>,max=MAX_ATTACHMENT){const chunks:Uint8Array[]=[];let total=0;while(true){const p=await reader.read();if(p.done)break;total+=p.value.length;if(total>max){await reader.cancel();throw new AppError(413,'FILE_TOO_LARGE','Файл слишком большой.');}chunks.push(p.value);}return Buffer.concat(chunks);}
export function attachmentStorage():AttachmentStorage{
 if(process.env.ATTACHMENT_STORAGE==='filesystem'&&process.env.ATTACHMENT_STORAGE_PATH)return new FileAttachmentStorage(process.env.ATTACHMENT_STORAGE_PATH);
 const endpoint=process.env.S3_ENDPOINT,bucket=process.env.S3_BUCKET,accessKeyId=process.env.S3_ACCESS_KEY_ID,secretAccessKey=process.env.S3_SECRET_ACCESS_KEY;
 if(!endpoint||!bucket||!accessKeyId||!secretAccessKey)throw new AppError(503,'STORAGE_NOT_CONFIGURED','Файловое хранилище пока не настроено.');if(new URL(endpoint).protocol!=='https:')throw new AppError(503,'STORAGE_NOT_CONFIGURED','Для хранилища требуется HTTPS.');return new S3AttachmentStorage(new S3Client({endpoint,region:process.env.S3_REGION??'us-east-1',credentials:{accessKeyId,secretAccessKey},forcePathStyle:true,maxAttempts:3}),bucket);
}
