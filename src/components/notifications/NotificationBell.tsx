"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { apiRequest } from "@/lib/apiClient";
export function NotificationBell() {
  const { currentBusiness } = useBusinessContext();
  const [state, setState] = useState<{
    business: string;
    count: number;
  } | null>(null);
  useEffect(() => {
    const id = currentBusiness?.id;
    if (!id) return;
    let live = true;
    async function refresh() {
      try {
        const items = await apiRequest<{ read_at: string | null }[]>(
          `/api/v1/businesses/${id}/notifications`,
        );
        if (live)
          setState({
            business: id!,
            count: items.filter((i) => !i.read_at).length,
          });
      } catch {
        if (live) setState(null);
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 10000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [currentBusiness?.id]);
  const count = state?.business === currentBusiness?.id ? state?.count : 0;
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
