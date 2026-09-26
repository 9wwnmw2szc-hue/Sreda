"use client";
import { getFirstName, getGreeting } from "@/lib/format";
import { Check, AlertCircle, LoaderCircle } from "lucide-react";
import type { Connection, User } from "@/types";
export function DashboardHeader({
  user,
  connections,
  loading,
}: {
  user: User | null;
  connections: Connection[];
  loading: boolean;
}) {
  const healthy =
    connections.length > 0 &&
    connections.every((item) => item.status === "connected");
  return (
    <header className="dashboard-greeting">
      <h1>
        {getGreeting()}
        {user ? `, ${getFirstName(user.name)}` : ""}!
      </h1>
      <p className="desktop-greeting-copy">
        {loading
          ? "Готовим ваше рабочее пространство."
          : healthy
            ? "Площадки подключены. Состояние обработчиков — в разделе «Решения»."
            : connections.length
              ? "Проверьте подключения — некоторым нужно внимание."
              : "Выберите решение. Остальное возьмут на себя БизнеСоты."}
      </p>
      <p className={`mobile-health ${healthy ? "tone-success" : "tone-muted"}`}>
        {loading ? (
          <LoaderCircle size={16} />
        ) : healthy ? (
          <Check size={16} />
        ) : (
          <AlertCircle size={16} />
        )}
        {loading
          ? "Загружаем подключения…"
          : healthy
            ? "Площадки подключены"
            : connections.length
              ? "Подключения требуют внимания"
              : "Пока нет подключённых площадок"}
      </p>
    </header>
  );
}
