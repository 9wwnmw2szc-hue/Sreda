"use client";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/apiClient";
type Profile = {
  name: string;
  public_name: string | null;
  greeting: string;
  description: string;
  contact_info: string;
  timezone: string;
};
export function BusinessProfilePanel({
  businessId,
  canEdit,
}: {
  businessId: string;
  canEdit: boolean;
}) {
  const [profile, setProfile] = useState<Profile | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const url = `/api/v1/businesses/${businessId}/profile`;
  useEffect(() => {
    let active = true;
    void apiRequest<Profile>(url)
      .then((p) => {
        if (active) setProfile(p);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [url]);
  async function save() {
    setBusy(true);
    setError("");
    try {
      setProfile(
        await apiRequest<Profile>(url, {
          method: "PATCH",
          body: JSON.stringify(profile),
        }),
      );
      setNotice(
        "Профиль сохранён. Бот будет использовать публичное название бизнеса.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить.");
    } finally {
      setBusy(false);
    }
  }
  const labels: Record<keyof Profile, string> = {
    name: "Название бизнеса",
    public_name: "Публичное название",
    greeting: "Приветствие",
    description: "Описание",
    contact_info: "Контакты",
    timezone: "Часовой пояс IANA",
  };
  return (
    <section className="panel crm-panel">
      <h2>Профиль бизнеса</h2>
      {error && (
        <p role="alert" className="account-error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!profile ? (
        <p>Загрузка профиля…</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          {(Object.keys(labels) as (keyof Profile)[]).map((key) => (
            <label key={key}>
              {labels[key]}
              {["greeting", "description", "contact_info"].includes(key) ? (
                <textarea
                  disabled={!canEdit || busy}
                  value={profile[key] ?? ""}
                  onChange={(e) =>
                    setProfile({ ...profile, [key]: e.target.value })
                  }
                />
              ) : (
                <input
                  disabled={!canEdit || busy}
                  required={key === "name" || key === "timezone"}
                  value={profile[key] ?? ""}
                  onChange={(e) =>
                    setProfile({ ...profile, [key]: e.target.value })
                  }
                />
              )}
            </label>
          ))}
          {canEdit && (
            <button className="button button--primary" disabled={busy}>
              Сохранить профиль
            </button>
          )}
        </form>
      )}
    </section>
  );
}
