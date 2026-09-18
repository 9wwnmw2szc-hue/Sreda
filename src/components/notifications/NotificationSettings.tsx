"use client";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/apiClient";

type Settings = {
  connected: boolean;
  telegramConnected?: boolean;
  vkConnected?: boolean;
  canManage: boolean;
  members: { id: string; name: string }[];
  preferences: { user_id: string; type: string; enabled: boolean }[];
  types: string[];
};

const labels: Record<string, string> = {
  "lead.created": "Новая заявка",
  "message.received": "Новое сообщение",
  "booking.created": "Новая запись",
  "booking.cancelled": "Отмена записи",
  "booking.rescheduled": "Перенос записи",
  "post.failed": "Ошибка публикации",
};

export function NotificationSettings({ businessId }: { businessId: string }) {
  const [data, setData] = useState<Settings | null>(null),
    [error, setError] = useState(""),
    [command, setCommand] = useState(""),
    [commandPlatform, setCommandPlatform] = useState<"telegram" | "vk" | "">(
      "",
    ),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState<"telegram" | "vk" | "">("");
  const url = `/api/v1/businesses/${businessId}/notification-settings`;
  useEffect(() => {
    let live = true;
    void apiRequest<Settings>(url)
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [url]);
  async function save(body: object) {
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest<{
        command?: string;
        platform?: "telegram" | "vk";
      }>(url, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setCommand(result.command ?? "");
      setCommandPlatform(result.platform ?? "");
      setConfirm("");
      setData(await apiRequest<Settings>(url));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить.");
    } finally {
      setBusy(false);
    }
  }
  const telegramOk = data?.telegramConnected ?? data?.connected;
  const vkOk = data?.vkConnected;
  return (
    <section className="panel crm-panel">
      <h2>Получатели уведомлений</h2>
      {error && <p role="alert">{error}</p>}
      {!data ? (
        <p>Загрузка настроек…</p>
      ) : (
        <>
          <p>
            Telegram: {telegramOk ? "подключён" : "не подключён"}. VK:{" "}
            {vkOk ? "подключён" : "не подключён"}.
          </p>
          <div className="stack-sm">
            <button
              disabled={busy}
              onClick={() => void save({ action: "connect", platform: "telegram" })}
            >
              Код для Telegram
            </button>
            <button
              disabled={busy}
              onClick={() => void save({ action: "connect", platform: "vk" })}
            >
              Код для VK
            </button>
            {telegramOk ? (
              <button disabled={busy} onClick={() => setConfirm("telegram")}>
                Отключить Telegram
              </button>
            ) : null}
            {vkOk ? (
              <button disabled={busy} onClick={() => setConfirm("vk")}>
                Отключить VK
              </button>
            ) : null}
          </div>
          {confirm ? (
            <div role="dialog" aria-label="Отключить уведомления">
              <p>
                Отключить {confirm === "telegram" ? "Telegram" : "VK"}
                -уведомления для вашего аккаунта?
              </p>
              <button
                disabled={busy}
                onClick={() =>
                  void save({ action: "disconnect", platform: confirm })
                }
              >
                Отключить
              </button>
              <button onClick={() => setConfirm("")}>Назад</button>
            </div>
          ) : null}
          {command ? (
            <div role="status">
              <p>
                {commandPlatform === "vk"
                  ? "Отправьте это сообщение в VK-сообщество бизнеса в течение 10 минут:"
                  : "Отправьте эту команду в Telegram-бот бизнеса в течение 10 минут:"}
              </p>
              <code style={{ overflowWrap: "anywhere" }}>{command}</code>
              <button
                onClick={() =>
                  void apiRequest<Settings>(url)
                    .then(setData)
                    .catch((e) => setError(e.message))
                }
              >
                Проверить подключение
              </button>
            </div>
          ) : null}
          {data.canManage &&
            data.members.map((m) => (
              <fieldset key={m.id}>
                <legend>{m.name}</legend>
                {data.types.map((type) => (
                  <label key={type}>
                    <input
                      type="checkbox"
                      disabled={busy}
                      checked={
                        data.preferences.find(
                          (p) => p.user_id === m.id && p.type === type,
                        )?.enabled !== false
                      }
                      onChange={(e) =>
                        void save({
                          action: "preferences",
                          user_id: m.id,
                          type,
                          enabled: e.target.checked,
                        })
                      }
                    />
                    {labels[type] ?? type}
                  </label>
                ))}
              </fieldset>
            ))}
        </>
      )}
    </section>
  );
}
