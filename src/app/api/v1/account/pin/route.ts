import { getRuntime } from "@/server/runtime";
import { createPinHandler } from "@/server/http/pin-handler";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return createPinHandler(getRuntime())(request); }
export async function POST(request: Request) { return createPinHandler(getRuntime())(request); }
