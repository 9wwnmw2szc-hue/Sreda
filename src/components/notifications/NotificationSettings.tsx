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

const TYPE_LABELS: Record<string, string> = {
  "lead.created": "Новая заявка",
  "message.received": "Новое сообщение",
  "booking.created": "Новая запись",
  "booking.cancelled": "Отмена записи",
  "booking.rescheduled": "Перенос записи",
  "booking.upcoming": "Напоминание о записи",
  "order.created": "Новый заказ",
  "post.failed": "Ошибка публикации",
  "calendar.reminder": "Напоминание календаря",
  "inventory.low_stock": "Низкий остаток",
};

function typeLabel(type: string) {
  return TYPE_LABELS[type] ?? type.replace(/\./g, " · ");
}

export function NotificationSettings({ businessId }: { businessId: string }) {
  const [data, setData] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  const [command, setCommand] = useState("");
  const [commandPlatform, setCommandPlatform] = useState<"telegram" | "vk" | "">(
    "",
  );
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"telegram" | "vk" | "">("");
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
    <section className="notif-settings" aria-labelledby="notif-settings-title">
      <header className="notif-settings__header">
        <h2 id="notif-settings-title">Каналы и типы</h2>
        <p className="notif-settings__lead">
          Подключите Telegram или VK и выберите, о чём вас уведомлять.
        </p>
      </header>

      {error ? (
        <p className="account-error" role="alert">
          {error}
        </p>
      ) : null}

      {!data ? (
        <p className="text-body-sm">Загрузка настроек…</p>
      ) : (
        <>
          <ul className="notif-channels" aria-label="Статус каналов">
            <li className={telegramOk ? "is-on" : "is-off"}>
              <span className="notif-channels__name">Telegram</span>
              <span className="notif-channels__status">
                {telegramOk ? "подключён" : "не подключён"}
              </span>
            </li>
            <li className={vkOk ? "is-on" : "is-off"}>
              <span className="notif-channels__name">VK</span>
              <span className="notif-channels__status">
                {vkOk ? "подключён" : "не подключён"}
              </span>
            </li>
          </ul>

          <div className="notif-settings__actions">
            <button
              type="button"
              className="button button--outline button--sm"
              disabled={busy}
              onClick={() => void save({ action: "connect", platform: "telegram" })}
            >
              Код для Telegram
            </button>
            <button
              type="button"
              className="button button--outline button--sm"
              disabled={busy}
              onClick={() => void save({ action: "connect", platform: "vk" })}
            >
              Код для VK
            </button>
            {telegramOk ? (
              <button
                type="button"
                className="button button--ghost button--sm"
                disabled={busy}
                onClick={() => setConfirm("telegram")}
              >
                Отключить Telegram
              </button>
            ) : null}
            {vkOk ? (
              <button
                type="button"
                className="button button--ghost button--sm"
                disabled={busy}
                onClick={() => setConfirm("vk")}
              >
                Отключить VK
              </button>
            ) : null}
          </div>

          {confirm ? (
            <div className="notif-confirm" role="dialog" aria-label="Отключить уведомления">
              <p>
                Отключить {confirm === "telegram" ? "Telegram" : "VK"}
                -уведомления для вашего аккаунта?
              </p>
              <div className="notif-settings__actions">
                <button
                  type="button"
                  className="button button--primary button--sm"
                  disabled={busy}
                  onClick={() =>
                    void save({ action: "disconnect", platform: confirm })
                  }
                >
                  Отключить
                </button>
                <button
                  type="button"
                  className="button button--ghost button--sm"
                  onClick={() => setConfirm("")}
                >
                  Назад
                </button>
              </div>
            </div>
          ) : null}

          {command ? (
            <div className="notif-command" role="status">
              <p>
                {commandPlatform === "vk"
                  ? "Отправьте это сообщение в VK-сообщество бизнеса в течение 10 минут:"
                  : "Отправьте эту команду в Telegram-бот бизнеса в течение 10 минут:"}
              </p>
              <code>{command}</code>
              <button
                type="button"
                className="button button--outline button--sm"
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

          {data.canManage
            ? data.members.map((m) => (
                <fieldset key={m.id} className="notif-pref-group">
                  <legend>{m.name}</legend>
                  <ul className="notif-pref-list">
                    {data.types.map((type) => {
                      const enabled =
                        data.preferences.find(
                          (p) => p.user_id === m.id && p.type === type,
                        )?.enabled !== false;
                      return (
                        <li key={type}>
                          <label className="notif-pref-row">
                            <input
                              type="checkbox"
                              className="notif-pref-check"
                              disabled={busy}
                              checked={enabled}
                              onChange={(e) =>
                                void save({
                                  action: "preferences",
                                  user_id: m.id,
                                  type,
                                  enabled: e.target.checked,
                                })
                              }
                            />
                            <span className="notif-pref-label">
                              {typeLabel(type)}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </fieldset>
              ))
            : null}
        </>
      )}
    </section>
  );
}
