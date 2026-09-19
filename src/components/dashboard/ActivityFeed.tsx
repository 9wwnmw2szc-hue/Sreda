"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Inbox,
  ShoppingBag,
  CalendarDays,
  MessageCircle,
  PencilLine,
} from "lucide-react";
import { apiRequest } from "@/lib/apiClient";
import { formatRelativeDateTime } from "@/lib/format";

export type ActivityType = "lead" | "order" | "booking" | "message" | "post";

export type ActivityItem = {
  id: string;
  type: ActivityType;
  title: string;
  detail?: string;
  createdAt: string;
  href: string;
  entityId?: string;
};

type Tone = "leads" | "orders" | "booking" | "messages" | "autopost";

function toneOf(type: ActivityType): Tone {
  switch (type) {
    case "order":
      return "orders";
    case "booking":
      return "booking";
    case "message":
      return "messages";
    case "post":
      return "autopost";
    default:
      return "leads";
  }
}

function IconFor({ type }: { type: ActivityType }) {
  const props = { size: 16, strokeWidth: 1.7 } as const;
  switch (type) {
    case "order":
      return <ShoppingBag {...props} />;
    case "booking":
      return <CalendarDays {...props} />;
    case "message":
      return <MessageCircle {...props} />;
    case "post":
      return <PencilLine {...props} />;
    default:
      return <Inbox {...props} />;
  }
}

function clip(value: string | null | undefined, max = 96) {
  const text = (value ?? "").trim().replace(/\s+/g, " ");
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function iso(value: unknown): string {
  if (typeof value === "string" && value) return value;
  if (value instanceof Date) return value.toISOString();
  return "";
}

async function loadActivity(businessId: string): Promise<ActivityItem[]> {
  const id = encodeURIComponent(businessId);
  const now = Date.now();
  const from = new Date(now - 120 * 86400000).toISOString();
  const until = new Date(now + 60 * 86400000).toISOString();

  const [leadsRaw, ordersRaw, bookingsRaw, conversationsRaw, postsRaw] =
    await Promise.all([
      apiRequest<unknown>(`/api/v1/businesses/${id}/leads`).catch(() => []),
      apiRequest<unknown>(`/api/v1/businesses/${id}/orders?page=0`).catch(
        () => [],
      ),
      apiRequest<unknown>(
        `/api/v1/businesses/${id}/bookings?from=${encodeURIComponent(from)}&until=${encodeURIComponent(until)}&page=0`,
      ).catch(() => []),
      apiRequest<unknown>(
        `/api/v1/businesses/${id}/conversations?page=0`,
      ).catch(() => []),
      apiRequest<unknown>(
        `/api/v1/businesses/${id}/posts?filter=all&page=0`,
      ).catch(() => []),
    ]);

  const items: ActivityItem[] = [];

  for (const lead of asArray<Record<string, unknown>>(leadsRaw)) {
    const entityId = String(lead.id ?? "");
    const createdAt = iso(lead.createdAt ?? lead.created_at);
    if (!entityId || !createdAt) continue;
    const name = String(lead.name ?? "Клиент");
    items.push({
      id: `lead:${entityId}`,
      type: "lead",
      title: `Новая заявка · ${name}`,
      detail: clip(String(lead.message ?? "")) || "Клиент оставил заявку",
      createdAt,
      href: "/leads",
      entityId,
    });
  }

  for (const order of asArray<Record<string, unknown>>(ordersRaw)) {
    const entityId = String(order.id ?? "");
    const createdAt = iso(order.created_at ?? order.createdAt);
    if (!entityId || !createdAt) continue;
    const num = order.order_number ?? order.orderNumber;
    const customer = String(
      order.customer_name ?? order.client_name ?? order.customerName ?? "",
    );
    const total = order.total != null ? String(order.total) : "";
    const currency = order.currency ? String(order.currency) : "₽";
    items.push({
      id: `order:${entityId}`,
      type: "order",
      title: num != null ? `Новый заказ №${num}` : "Новый заказ",
      detail: clip(
        [customer, total ? `${total} ${currency}` : ""]
          .filter(Boolean)
          .join(" · "),
      ),
      createdAt,
      href: "/orders",
      entityId,
    });
  }

  for (const booking of asArray<Record<string, unknown>>(bookingsRaw)) {
    const entityId = String(booking.id ?? "");
    const createdAt = iso(booking.created_at ?? booking.createdAt);
    if (!entityId || !createdAt) continue;
    const client = String(booking.client_name ?? booking.clientName ?? "Клиент");
    const service = String(
      booking.service_name ?? booking.serviceName ?? "",
    );
    const starts = iso(booking.starts_at ?? booking.startsAt);
    items.push({
      id: `booking:${entityId}`,
      type: "booking",
      title: `Новая запись · ${client}`,
      detail: clip(
        [service, starts ? new Date(starts).toLocaleString("ru") : ""]
          .filter(Boolean)
          .join(" · "),
      ),
      createdAt,
      href: "/bookings",
      entityId,
    });
  }

  for (const conv of asArray<Record<string, unknown>>(conversationsRaw)) {
    const entityId = String(conv.id ?? "");
    const createdAt = iso(
      conv.lastMessageAt ?? conv.last_message_at ?? conv.createdAt ?? conv.created_at,
    );
    if (!entityId || !createdAt) continue;
    const name = String(
      conv.clientName ?? conv.client_name ?? conv.externalUsername ?? "Клиент",
    );
    items.push({
      id: `message:${entityId}`,
      type: "message",
      title: `Новое сообщение · ${name}`,
      detail: clip(String(conv.lastMessage ?? conv.last_message ?? "")),
      createdAt,
      href: "/messages",
      entityId,
    });
  }

  for (const post of asArray<Record<string, unknown>>(postsRaw)) {
    const entityId = String(post.id ?? "");
    const createdAt = iso(post.created_at ?? post.createdAt);
    if (!entityId || !createdAt) continue;
    const status = String(post.status ?? "");
    const title =
      status === "published"
        ? "Пост опубликован"
        : status === "scheduled"
          ? "Публикация запланирована"
          : status === "failed" || status === "partial"
            ? "Ошибка публикации"
            : "Черновик поста";
    items.push({
      id: `post:${entityId}`,
      type: "post",
      title,
      detail: clip(String(post.text ?? "")),
      createdAt,
      href: "/posts",
      entityId,
    });
  }

  const seen = new Set<string>();
  return items
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ||
        b.id.localeCompare(a.id),
    )
    .slice(0, 8);
}

export function ActivityFeed({ businessId }: { businessId: string }) {
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [activeId, setActiveId] = useState(businessId);

  useEffect(() => {
    let live = true;
    void loadActivity(businessId)
      .then((rows) => {
        if (!live) return;
        setActiveId(businessId);
        setItems(rows);
      })
      .catch(() => {
        if (!live) return;
        setActiveId(businessId);
        setItems([]);
      });
    return () => {
      live = false;
    };
  }, [businessId]);

  const shown = activeId === businessId ? items : null;

  return (
    <section className="panel soty-activity" aria-labelledby="soty-activity-title">
      <div className="panel-heading">
        <h2 id="soty-activity-title">Лента активности</h2>
        <Link href="/clients" className="text-link">
          История клиентов
          <ChevronRight size={16} />
        </Link>
      </div>
      {shown == null ? (
        <p className="text-body-sm">Загрузка…</p>
      ) : shown.length ? (
        <ul className="soty-activity__list">
          {shown.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                className={`soty-activity__row soty-activity__row--${toneOf(item.type)}`}
              >
                <span className="soty-activity__icon" aria-hidden>
                  <IconFor type={item.type} />
                </span>
                <span className="soty-activity__body">
                  <strong>{item.title}</strong>
                  {item.detail ? <span>{item.detail}</span> : null}
                </span>
                <time dateTime={item.createdAt}>
                  {formatRelativeDateTime(item.createdAt)}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty-state empty-state--compact">
          <Inbox size={24} />
          <p>
            <strong>Пока тихо</strong>
          </p>
          <p className="empty-copy">
            Заявки, заказы, записи, сообщения и посты появятся здесь по мере
            работы бизнеса.
          </p>
          <Link href="/solutions" className="button button--outline button--sm">
            Подключить решения
          </Link>
        </div>
      )}
    </section>
  );
}
