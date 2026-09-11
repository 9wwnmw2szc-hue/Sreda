"use client";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight, CalendarDays } from "lucide-react";
import { PlatformBadge } from "@/components/ui/PlatformBadge";
import { formatRelativeDateTime } from "@/lib/format";
import type { Post } from "@/types";
export function ScheduledPosts({
  posts,
  onSelect,
}: {
  posts: Post[];
  onSelect?: (post: Post) => void;
}) {
  return (
    <section className="panel posts-panel">
      <div className="panel-heading">
        <h2>
          <span className="desktop-only">Ближайшие посты</span>
          <span className="mobile-only">Следующий пост</span>
        </h2>
        <Link href="/posts" className="text-link">
          Все посты
          <ChevronRight size={16} />
        </Link>
      </div>
      {posts.length ? (
        <ul className="post-list">
          {posts.map((post, index) => (
            <li key={post.id}>
              <button className="post-row" onClick={() => onSelect?.(post)}>
                <span className={`post-thumb post-thumb--${index}`}>
                  <Image
                    src={post.imageUrl ?? "/assets/sreda/v2/cafe.webp"}
                    alt=""
                    width={120}
                    height={120}
                    sizes="80px"
                  />
                </span>
                <span className="post-row__body">
                  <strong>{post.text}</strong>
                  {post.excerpt && <span>{post.excerpt}</span>}
                  <time dateTime={post.publishAt}>
                    {post.publishAt
                      ? formatRelativeDateTime(post.publishAt)
                      : "Без даты"}
                  </time>
                </span>
                <span className="post-row__platforms">
                  {post.platforms.map((platform) => (
                    <PlatformBadge key={platform} platform={platform} compact />
                  ))}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty-state">
          <CalendarDays size={26} />
          <p>Запланируйте первый пост — мы опубликуем его вовремя.</p>
        </div>
      )}
    </section>
  );
}
