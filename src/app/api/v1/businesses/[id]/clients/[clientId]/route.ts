import { crmHandler } from "@/server/http/crm-handler";
export const dynamic="force-dynamic";
export async function GET(request:Request, {params}:{params:Promise<{id:string;clientId:string}>}){const p=await params;return crmHandler(request,p.id,"clients",p.clientId);}
export async function POST(request:Request, {params}:{params:Promise<{id:string;clientId:string}>}){const p=await params;return crmHandler(request,p.id,"clients",p.clientId);}
export async function PATCH(request:Request, {params}:{params:Promise<{id:string;clientId:string}>}){const p=await params;return crmHandler(request,p.id,"clients",p.clientId);}
