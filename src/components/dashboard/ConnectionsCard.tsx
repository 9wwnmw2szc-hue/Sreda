import Link from "next/link";
import { Plus } from "lucide-react";
import { PlatformBadge } from "@/components/ui/PlatformBadge";
import type { Connection } from "@/types";
const statusLabels: Record<Connection["status"], string> = {
  connected: "Подключён",
  disconnected: "Отключён",
  pending: "Ожидает подключения",
  error: "Нужна проверка",
};
export function ConnectionsCard({
  connections,
}: {
  connections: Connection[];
}) {
  return (
    <section className="panel connections-card">
      <h2>Подключения</h2>
      <ul className="connection-list">
        {connections.length ? (
          connections.map((connection) => (
            <li key={connection.id}>
              <PlatformBadge platform={connection.platform} compact />
              <div>
                <strong>
                  {connection.platform === "telegram"
                    ? "Telegram"
                    : connection.platform === "vk"
                      ? "ВКонтакте"
                      : "MAX"}
                </strong>
                <span
                  className={`solution-state ${connection.status === "connected" ? "tone-success" : "tone-warning"}`}
                >
                  <i aria-hidden />
                  {statusLabels[connection.status]}
                </span>
              </div>
            </li>
          ))
        ) : (
          <li className="empty-copy">
            Подключите площадку, где общаются ваши клиенты.
          </li>
        )}
      </ul>
      <Link href="/connections" className="button button--outline button--full">
        <Plus size={18} />
        Подключить канал
      </Link>
    </section>
  );
}
