"use client";

import { useEffect, useState } from "react";
import { apiRequest, ClientError } from "@/lib/apiClient";

type Binding = {
  platform: "telegram" | "vk";
  userPublicId: string;
  userName: string;
  userUsername: string;
  displayName: string | null;
  username: string | null;
  externalUserId: string;
  status: "active" | "revoked";
  boundAt: string;
  lastActiveAt: string | null;
};

type ListResponse = { items: Binding[] };

function formatWhen(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("ru-RU");
  } catch {
    return value;
  }
}

export function ChannelAdminPanel({
  businessId,
  canManage,
}: {
  businessId: string;
  canManage: boolean;
}) {
  const [items, setItems] = useState<Binding[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [challenge, setChallenge] = useState<{
    platform: "telegram" | "vk";
    deepLinkHint: string;
    expiresAt: string;
  } | null>(null);
  const url = `/api/v1/businesses/${businessId}/channel-admin`;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiRequest<ListResponse>(url);
        if (cancelled) return;
        setItems(data.items ?? []);
        setError("");
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof ClientError || e instanceof Error
              ? e.message
              : "Не удалось загрузить привязки",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  async function reload() {
    try {
      const data = await apiRequest<ListResponse>(url);
      setItems(data.items ?? []);
      setError("");
    } catch (e) {
      setError(
        e instanceof ClientError || e instanceof Error
          ? e.message
          : "Не удалось загрузить привязки",
      );
    }
  }

  async function startChallenge(platform: "telegram" | "vk") {
    if (!canManage || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await apiRequest<{
        deepLinkHint: string;
        expiresAt: string;
        platform: "telegram" | "vk";
      }>(url, {
        method: "POST",
        body: JSON.stringify({ action: "challenge", platform }),
      });
      setChallenge({
        platform: res.platform,
        deepLinkHint: res.deepLinkHint,
        expiresAt: res.expiresAt,
      });
      setNotice(
        platform === "telegram"
          ? "Откройте Telegram-бота бизнеса и отправьте команду ниже."
          : "Откройте диалог VK-сообщества и отправьте команду ниже.",
      );
      await reload();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось создать код подтверждения",
      );
    } finally {
      setBusy(false);
    }
  }

  async function revoke(platform: "telegram" | "vk", targetUserId?: string) {
    if (!canManage || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiRequest(url, {
        method: "POST",
        body: JSON.stringify({
          action: "revoke",
          platform,
          ...(targetUserId ? { targetUserId } : {}),
        }),
      });
      setChallenge(null);
      setNotice("Доступ отозван. Админ-кнопки в канале больше не действуют.");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось отозвать доступ");
    } finally {
      setBusy(false);
    }
  }

  const active = items.filter((i) => i.status === "active");

  return (
    <section className="panel settings-panel">
      <h2 className="text-section-title">Доступ через Telegram / VK</h2>
      <p className="account-footnote">
        Это не уведомления и не вход клиента. Подтверждённый аккаунт получает
        административное меню в боте бизнеса — с теми же правами, что и на
        сайте.
      </p>
      {loading ? (
        <p className="account-footnote" role="status">
          Загрузка…
        </p>
      ) : null}
      {error ? (
        <p className="account-error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="account-notice" role="status">
          {notice}
        </p>
      ) : null}

      {canManage ? (
        <div className="settings-business" style={{ gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className="button button--outline"
            disabled={busy}
            onClick={() => void startChallenge("telegram")}
          >
            Подключить Telegram для управления
          </button>
          <button
            type="button"
            className="button button--outline"
            disabled={busy}
            onClick={() => void startChallenge("vk")}
          >
            Подключить VK для управления
          </button>
        </div>
      ) : (
        <p className="account-footnote">
          Подключение доступно владельцу и администратору бизнеса.
        </p>
      )}

      {challenge ? (
        <div className="account-invitations" style={{ marginTop: 12 }}>
          <strong>
            {challenge.platform === "telegram" ? "Telegram" : "VK"}: код
            подтверждения
          </strong>
          <p>
            Отправьте боту:
            <code
              style={{
                display: "block",
                marginTop: 8,
                padding: "10px 12px",
                borderRadius: 10,
                background: "var(--bg-muted)",
                wordBreak: "break-all",
              }}
            >
              {challenge.deepLinkHint}
            </code>
          </p>
          <p className="account-footnote">
            Действует до {formatWhen(challenge.expiresAt)}. Код одноразовый —
            не пересылайте его.
          </p>
        </div>
      ) : null}

      <div style={{ marginTop: 16 }}>
        <strong>Подтверждённые аккаунты</strong>
        {active.length === 0 ? (
          <p className="account-footnote">Пока нет привязок.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
            {active.map((row) => (
              <li
                key={`${row.platform}:${row.userPublicId}`}
                className="settings-business"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div>
                    {row.platform === "telegram" ? "Telegram" : "VK"} ·{" "}
                    {row.displayName ||
                      (row.username ? `@${row.username}` : row.userName)}
                  </div>
                  <div className="account-footnote">
                    {row.userName} (@{row.userUsername}) · с{" "}
                    {formatWhen(row.boundAt)}
                    {row.lastActiveAt
                      ? ` · активность ${formatWhen(row.lastActiveAt)}`
                      : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className="status-pill status-pill--ok">
                    Подтверждён
                  </span>
                  {canManage ? (
                    <button
                      type="button"
                      className="button button--outline"
                      disabled={busy}
                      onClick={() =>
                        void revoke(row.platform, row.userPublicId)
                      }
                    >
                      Отвязать
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
