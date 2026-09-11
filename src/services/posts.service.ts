import { delay } from "@/lib/delay";
import { mockPosts } from "@/mocks/posts";
import type { Post } from "@/types";

export async function getPosts(businessId: string): Promise<Post[]> {
  await delay();
  return mockPosts.filter((post) => post.businessId === businessId);
}

export async function getScheduledPosts(
  businessId: string,
  limit = 5,
): Promise<Post[]> {
  const posts = await getPosts(businessId);
  return posts
    .filter((post) => post.status === "scheduled")
    .sort((a, b) => {
      const aTime = a.publishAt ? new Date(a.publishAt).getTime() : 0;
      const bTime = b.publishAt ? new Date(b.publishAt).getTime() : 0;
      return aTime - bTime;
    })
    .slice(0, limit);
}
