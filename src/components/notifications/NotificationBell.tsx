"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { apiRequest } from "@/lib/apiClient";

type CountItem = { read_at: string | null; resolved_at?: string | null };

export function NotificationBell() {
  const { currentBusiness } = useBusinessContext();
  const [count, setCount] = useState(0);

  useEffect(() => {
    const businessId = currentBusiness?.id;
    let live = true;
    async function refresh() {
      try {
        const inboxPromise = apiRequest<CountItem[]>("/api/v1/inbox");
        const businessPromise = businessId
          ? apiRequest<CountItem[]>(
              `/api/v1/businesses/${businessId}/notifications`,
            )
          : Promise.resolve([] as CountItem[]);
        const [inbox, business] = await Promise.all([
          inboxPromise,
          businessPromise,
        ]);
        if (!live) return;
        const inboxCount = inbox.filter((i) => !i.resolved_at).length;
        const businessCount = business.filter(
          (i) => !i.read_at && !i.resolved_at,
        ).length;
        setCount(inboxCount + businessCount);
      } catch {
        if (live) setCount(0);
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 10000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [currentBusiness?.id]);

  return (
    <Link
      href="/notifications"
      className="notification-bell"
      aria-label={`Уведомления${count ? ": " + count + " непрочитанных" : ""}`}
    >
      <Bell size={20} />
      {!!count && <span>{count >= 100 ? "99+" : count}</span>}
    </Link>
  );
}
