import { crmHandler } from "@/server/http/crm-handler";
export const dynamic="force-dynamic";
export async function GET(request:Request, {params}:{params:Promise<{id:string}>}){return crmHandler(request,(await params).id,"clients");}
export async function POST(request:Request, {params}:{params:Promise<{id:string}>}){return crmHandler(request,(await params).id,"clients");}
