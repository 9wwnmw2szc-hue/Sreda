import { calendarHandler } from "@/server/http/calendar-handler";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return calendarHandler(request, (await params).id, "reminders");
}
