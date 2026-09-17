"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowRight, Store } from "lucide-react";
import { apiRequest } from "@/lib/apiClient";
import type { Business } from "@/types";

const ZONES = [
  ["Europe/Kaliningrad", "Калининград"], ["Europe/Moscow", "Москва"],
  ["Europe/Samara", "Самара"], ["Asia/Yekaterinburg", "Екатеринбург"],
  ["Asia/Omsk", "Омск"], ["Asia/Krasnoyarsk", "Красноярск"],
  ["Asia/Irkutsk", "Иркутск"], ["Asia/Yakutsk", "Якутск"],
  ["Asia/Vladivostok", "Владивосток"], ["Asia/Magadan", "Магадан"],
  ["Asia/Kamchatka", "Камчатка"], ["UTC", "UTC"],
];
export function CreateBusinessForm({ userId, hasBusinesses }: { userId: string; hasBusinesses: boolean }) {
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("Europe/Moscow");
  const [businessType, setBusinessType] = useState<"store" | "service" | "hybrid">("hybrid");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const key = useRef<string | null>(null);
  const previous = useRef("");
  async function submit() {
    setBusy(true); setError("");
    const body = JSON.stringify({ name, timezone, business_type: businessType });
    if (!key.current || previous.current !== body) { key.current = crypto.randomUUID(); previous.current = body; }
    try {
      const business = await apiRequest<Business>("/api/v1/businesses", {
        method: "POST", body, headers: { "Idempotency-Key": key.current },
      });
      try { localStorage.setItem("sreda.currentBusinessId:" + userId, business.id); } catch { /* optional preference */ }
      window.location.replace("/dashboard");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Не удалось создать бизнес.");
      setBusy(false);
    }
  }
  return <div className="account-card">
    <span className="account-symbol"><Store size={27} /></span>
    <span className="eyebrow">{hasBusinesses ? "Новое пространство" : "Первый шаг"}</span>
    <h2>{hasBusinesses ? "Добавим ещё бизнес" : "Как называется ваш бизнес?"}</h2>
    <p className="account-intro">Создайте своё пространство. Здесь будут решения, подключения и заявки этого бизнеса.</p>
    <form onSubmit={(event) => { event.preventDefault(); if (!busy) void submit(); }}>
      <fieldset disabled={busy}>
        <label htmlFor="business-name">Название бизнеса</label>
        <input id="business-name" autoComplete="organization" required maxLength={100}
          value={name} onChange={(event) => setName(event.target.value)} placeholder="Например, кофейня «Зёрно»" />
        <label htmlFor="business-type">Тип бизнеса</label>
        <select id="business-type" value={businessType} onChange={(event) => setBusinessType(event.target.value as typeof businessType)}>
          <option value="store">Магазин / товары</option>
          <option value="service">Услуги</option>
          <option value="hybrid">Товары и услуги</option>
        </select>
        <p className="field-hint">Помогает с рекомендациями. Позже можно изменить и подключить любые решения.</p>
        <label htmlFor="business-timezone">Часовой пояс</label>
        <select id="business-timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)}>
          {ZONES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <p className="field-hint">Для расписания публикаций и напоминаний. Выберите время вашего бизнеса.</p>
        {error && <p className="account-error" role="alert">{error}</p>}
        <button type="submit" className="button button--primary button--full">
          {busy ? "Создаём…" : "Создать пространство"}<ArrowRight size={18} />
        </button>
      </fieldset>
    </form>
    {hasBusinesses && <Link href="/dashboard" className="text-link account-back">Вернуться в свой бизнес</Link>}
    <p className="account-footnote">Создание пространства бесплатно. Выбор и подключение решений — следующий шаг.</p>
  </div>;
}
