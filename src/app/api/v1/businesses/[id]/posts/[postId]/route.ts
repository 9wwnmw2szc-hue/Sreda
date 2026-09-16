import { postsHandler } from "@/server/http/posts-handler";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; postId: string }> },
) {
  const p = await params;
  return postsHandler(request, p.id, "posts", p.postId);
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; postId: string }> },
) {
  const p = await params;
  return postsHandler(request, p.id, "posts", p.postId);
}
