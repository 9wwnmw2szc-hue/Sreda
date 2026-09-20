import { getRuntime } from "@/server/runtime";
import { createAdminHandler } from "@/server/http/admin-handler";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
export async function GET(request: Request, ctx: Ctx) {
  return createAdminHandler(getRuntime()).user(request, (await ctx.params).id);
}
export async function POST(request: Request, ctx: Ctx) {
  return createAdminHandler(getRuntime()).user(request, (await ctx.params).id);
}
