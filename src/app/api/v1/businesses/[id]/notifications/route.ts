import { crmHandler } from "@/server/http/crm-handler";
export const dynamic="force-dynamic";
export async function GET(request:Request, {params}:{params:Promise<{id:string}>}){return crmHandler(request,(await params).id,"notifications");}
export async function PATCH(request:Request, {params}:{params:Promise<{id:string}>}){return crmHandler(request,(await params).id,"notifications");}
