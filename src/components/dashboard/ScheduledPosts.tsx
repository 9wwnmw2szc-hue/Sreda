import Link from "next/link";
import { ImageIcon } from "lucide-react";
import { PlatformBadge } from "@/components/ui/PlatformBadge";
import { PostStatusPill } from "@/components/ui/StatusPill";
import { formatRelativeDateTime } from "@/lib/format";
import { postStatusLabel } from "@/lib/labels";
import type { Post } from "@/types";

interface ScheduledPostsProps {
  posts: Post[];
}

export function ScheduledPosts({ posts }: ScheduledPostsProps) {
  return (
    <section className="dashboard-lower-card rounded-[24px] border border-[var(--border-light)] bg-[var(--surface)] p-5 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
          Запланированные посты
        </h2>
        <Link
          href="/posts"
          className="text-sm font-medium text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
        >
          Все посты →
        </Link>
      </div>

      <ul className="divide-y divide-[var(--border-light)]">
        {posts.length === 0 ? (
          <li className="py-6 text-sm text-[var(--text-muted)]">
            Пока нет постов
          </li>
        ) : (
          posts.map((post) => (
            <li
              key={post.id}
              className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:gap-4"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span
                  className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[linear-gradient(145deg,#f3ebe2,#e4d4c4)] text-[var(--text-muted)]"
                  aria-hidden
                >
                  <ImageIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                    {post.text}
                  </p>
                  <div className="mt-1 flex items-center gap-1.5">
                    {post.platforms.map((platform) => (
                      <PlatformBadge
                        key={platform}
                        platform={platform}
                        compact
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <span className="text-xs text-[var(--text-muted)]">
                  {post.publishAt
                    ? formatRelativeDateTime(post.publishAt)
                    : "Без даты"}
                </span>
                <PostStatusPill
                  label={postStatusLabel(post.status)}
                  status={post.status}
                />
              </div>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
