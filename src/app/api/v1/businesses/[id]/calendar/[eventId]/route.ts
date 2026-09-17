import { calendarHandler } from "@/server/http/calendar-handler";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; eventId: string }> },
) {
  const p = await params;
  return calendarHandler(request, p.id, "calendar", p.eventId);
}
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; eventId: string }> },
) {
  const p = await params;
  return calendarHandler(request, p.id, "calendar", p.eventId);
}
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; eventId: string }> },
) {
  const p = await params;
  return calendarHandler(request, p.id, "calendar", p.eventId);
}
