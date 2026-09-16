import { bookingHandler } from "@/server/http/booking-handler";
export async function PATCH(request:Request,{params}:{params:Promise<{id:string;bookingId:string}>}){const p=await params;return bookingHandler(request,p.id,"bookings",p.bookingId);}
