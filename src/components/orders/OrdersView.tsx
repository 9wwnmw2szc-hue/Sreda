"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { apiRequest } from "@/lib/apiClient";

type OrderRow = {
  id: string;
  status: string;
  fulfillment: string;
  customer_name: string;
  customer_phone: string;
  total: string;
  currency: string;
  client_id: string;
  client_name?: string;
  conversation_id: string | null;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  new: "Новый",
  accepted: "Принят",
  assembling: "Сборка",
  ready: "Готов",
  handed_over: "Выдан",
  delivered: "Доставлен",
  completed: "Завершён",
  cancelled: "Отменён",
};

export function OrdersView() {
  const { currentBusiness } = useBusinessContext();
  return currentBusiness ? (
    <Orders
      key={currentBusiness.id}
      businessId={currentBusiness.id}
      timezone={currentBusiness.timezone ?? "UTC"}
    />
  ) : (
    <p>Выберите бизнес.</p>
  );
}

function Orders({
  businessId,
  timezone,
}: {
  businessId: string;
  timezone: string;
}) {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const base = `/api/v1/businesses/${businessId}/orders`;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void apiRequest<OrderRow[]>(
      base + (status ? "?status=" + encodeURIComponent(status) : ""),
    )
      .then((rows) => {
        if (alive) {
          setOrders(rows);
          setError("");
        }
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "Ошибка загрузки.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [base, status]);

  return (
    <div className="crm-page">
      <header>
        <h1>Заказы</h1>
        <p>Заказы из каталога бота и витрины.</p>
      </header>
      {error && (
        <p role="alert" className="account-error">
          {error}
        </p>
      )}
      <section className="panel crm-panel">
        <label>
          Статус
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Все</option>
            {Object.entries(STATUS_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        {loading ? (
          <p role="status">Загрузка…</p>
        ) : !orders.length ? (
          <p>Заказов пока нет.</p>
        ) : (
          <ul className="crm-list">
            {orders.map((o) => (
              <li key={o.id}>
                <strong>
                  {o.customer_name} · {STATUS_LABEL[o.status] ?? o.status}
                </strong>
                <span>
                  {o.total} {o.currency} ·{" "}
                  {o.fulfillment === "delivery" ? "Доставка" : "Самовывоз"}
                </span>
                <small>
                  {new Date(o.created_at).toLocaleString("ru", {
                    timeZone: timezone,
                  })}
                </small>
                <span>
                  <Link href="/clients">Клиент</Link>
                  {o.conversation_id ? (
                    <>
                      {" · "}
                      <Link href="/messages">Диалог</Link>
                    </>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
