import type { ReactNode } from "react";

export type StatusBadgeTone =
  | "active"
  | "suspended"
  | "error"
  | "healthy"
  | "connected"
  | "disconnected"
  | "retrying"
  | "expired"
  | "trial"
  | "disabled"
  | "pending"
  | "warning"
  | "neutral";

const LABELS: Record<StatusBadgeTone, string> = {
  active: "Активен",
  suspended: "Приостановлен",
  error: "Ошибка",
  healthy: "Исправен",
  connected: "Подключен",
  disconnected: "Отключен",
  retrying: "Повтор",
  expired: "Истёк",
  trial: "Пробный",
  disabled: "Отключён",
  pending: "Ожидание",
  warning: "Внимание",
  neutral: "—",
};

export function StatusBadge({
  status,
  label,
  children,
}: {
  status: StatusBadgeTone;
  label?: string;
  children?: ReactNode;
}) {
  return (
    <span className={`admin-badge admin-badge--${status}`}>
      {children ?? label ?? LABELS[status]}
    </span>
  );
}

export function connectionStatusBadge(
  status: string | null | undefined,
): StatusBadgeTone {
  switch (status) {
    case "connected":
      return "connected";
    case "error":
      return "error";
    case "disconnected":
      return "disconnected";
    case "pending":
      return "pending";
    default:
      return "neutral";
  }
}

export function solutionStatusBadge(
  status: string | null | undefined,
): StatusBadgeTone {
  switch (status) {
    case "active":
      return "active";
    case "trial":
      return "trial";
    case "expired":
      return "expired";
    case "disabled":
      return "disabled";
    default:
      return "neutral";
  }
}

export function healthBadge(
  status: string | null | undefined,
): StatusBadgeTone {
  switch (status) {
    case "ok":
      return "healthy";
    case "unavailable":
      return "error";
    case "disabled":
      return "disabled";
    default:
      return "neutral";
  }
}
