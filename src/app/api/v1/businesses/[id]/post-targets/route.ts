import { postsHandler } from "@/server/http/posts-handler";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return postsHandler(request, (await params).id, "post-targets");
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return postsHandler(request, (await params).id, "post-targets");
}
