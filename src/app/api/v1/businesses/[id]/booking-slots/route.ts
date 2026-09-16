import { bookingHandler } from "@/server/http/booking-handler";
export const dynamic="force-dynamic";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return bookingHandler(request,(await params).id,"booking-slots");}
