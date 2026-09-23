"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/apiClient";
import { AiInterviewPanel } from "@/components/ai/AiInterviewPanel";
import { FieldHint } from "@/components/ui/SetupChrome";
import { FIELD_HINTS } from "@/lib/setupUx";

type Profile = {
  name: string;
  public_name: string | null;
  greeting: string;
  description: string;
  contact_info: string;
  timezone: string;
  business_type: "store" | "service" | "hybrid";
  ai_about: string;
  ai_tone: string;
  ai_important_facts: string;
  ai_restrictions: string;
  ai_delivery_info: string;
  ai_geography: string;
  ai_returns_info: string;
  ai_extra_instructions: string;
};

const TYPE_LABELS: Record<Profile["business_type"], string> = {
  store: "Магазин / товары",
  service: "Услуги",
  hybrid: "Товары и услуги",
};

export function BusinessProfilePanel({
  businessId,
  canEdit,
}: {
  businessId: string;
  canEdit: boolean;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const url = `/api/v1/businesses/${businessId}/profile`;

  async function reloadProfile() {
    const p = await apiRequest<Profile>(url);
    setProfile(p);
    return p;
  }

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

  function updateProfile(next: Profile) {
    setNotice("");
    setProfile(next);
  }

  async function save() {
    if (!profile) return;
    setBusy(true);
    setError("");
    try {
      setProfile(
        await apiRequest<Profile>(url, {
          method: "PATCH",
          body: JSON.stringify(profile),
        }),
      );
      setNotice("Профиль сохранён");
      requestAnimationFrame(() => {
        noticeRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить.");
    } finally {
      setBusy(false);
    }
  }

  const field = (
    key: keyof Profile,
    label: string,
    opts?: { textarea?: boolean; hint?: string },
  ) =>
    profile ? (
      <label key={key}>
        {label}
        {opts?.hint ? <span className="field-hint">{opts.hint}</span> : null}
        {opts?.textarea ? (
          <textarea
            disabled={!canEdit || busy}
            value={profile[key] ?? ""}
            onChange={(e) =>
              updateProfile({ ...profile, [key]: e.target.value })
            }
          />
        ) : (
          <input
            disabled={!canEdit || busy}
            required={key === "name" || key === "timezone"}
            value={profile[key] ?? ""}
            onChange={(e) =>
              updateProfile({ ...profile, [key]: e.target.value })
            }
          />
        )}
      </label>
    ) : null;

  return (
    <section className="panel crm-panel">
      <h2>Профиль бизнеса</h2>
      {error && (
        <p role="alert" className="account-error">
          {error}
        </p>
      )}
      {notice ? (
        <p ref={noticeRef} className="account-notice" role="status">
          {notice}
        </p>
      ) : null}
      {!profile ? (
        <p>Загрузка профиля…</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          {field("name", "Название бизнеса")}
          {field("public_name", "Публичное название")}
          <label>
            Тип бизнеса
            <select
              disabled={!canEdit || busy}
              value={profile.business_type ?? "hybrid"}
              onChange={(e) =>
                updateProfile({
                  ...profile,
                  business_type: e.target.value as Profile["business_type"],
                })
              }
            >
              {Object.entries(TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <span className="field-hint">
              Влияет на рекомендации и онбординг. Любые решения можно подключить
              вручную.
            </span>
          </label>
          {field("greeting", "Приветствие", {
            textarea: true,
            hint: FIELD_HINTS.greeting,
          })}
          {field("description", "Краткое описание", { textarea: true })}
          {field("contact_info", "Контакты", { textarea: true })}
          {field("timezone", "Часовой пояс IANA")}

          <p className="message-actions">
            <Link href="/onboarding" className="text-link">
              Онбординг по отрасли
            </Link>
            <Link href="/settings/advanced" className="text-link">
              Расширенная настройка бота
            </Link>
          </p>
          <FieldHint>
            Режим настройки (guided / advanced) меняется в блоке «Настройка по
            отрасли» выше или в онбординге.
          </FieldHint>

          <h3>AI-профиль</h3>
          <p className="field-hint">
            Расскажите о бизнесе обычным языком. Цены, остатки и расписание AI
            берёт только из настроек и каталога — не придумывает сам.
          </p>
          {field("ai_about", "Расскажите о своём бизнесе", {
            textarea: true,
            hint: "Чем занимаетесь, для кого, стиль общения.",
          })}
          {field("ai_tone", "Tone of voice")}
          {field("ai_important_facts", "Важные факты", { textarea: true })}
          {field("ai_restrictions", "Ограничения: что AI нельзя утверждать", {
            textarea: true,
            hint: FIELD_HINTS.aiRestrictions,
          })}
          {field("ai_delivery_info", "Доставка", { textarea: true })}
          {field("ai_geography", "Адрес / география", { textarea: true })}
          {field("ai_returns_info", "Возврат и гарантия", { textarea: true })}
          {field("ai_extra_instructions", "Дополнительные инструкции", {
            textarea: true,
          })}

          {canEdit && (
            <div className="stack-sm">
              {notice ? (
                <p className="account-toast" role="status">
                  {notice}
                </p>
              ) : null}
              <button className="button button--primary" disabled={busy}>
                {busy ? "Сохраняем…" : "Сохранить профиль"}
              </button>
            </div>
          )}
        </form>
      )}
      {canEdit ? (
        <details>
          <summary>AI-интервью</summary>
          <AiInterviewPanel
            businessId={businessId}
            onProfileApplied={() => {
              void reloadProfile().catch(() => {
                /* keep current fields */
              });
            }}
          />
        </details>
      ) : null}
    </section>
  );
}
