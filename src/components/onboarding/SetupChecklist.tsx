"use client";

import Link from "next/link";
import { useState } from "react";
import { apiRequest } from "@/lib/apiClient";
import { SetupProgress } from "@/components/ui/SetupChrome";
import { terminologyFor } from "@/lib/industryPresets";

type ChecklistStep = {
  id: string;
  label: string;
  href: string;
};

function stepsForIndustry(industry?: string | null): ChecklistStep[] {
  const terms = terminologyFor(industry);
  switch (industry) {
    case "beauty":
    case "sport_health":
    case "education":
    case "rental":
      return [
        {
          id: "services",
          label: "Добавить услуги",
          href: "/bookings?tab=config",
        },
        {
          id: "specialists",
          label: `Добавить: ${terms.specialists.toLowerCase()}`,
          href: "/bookings?tab=config",
        },
        {
          id: "schedule",
          label: "Настроить расписание",
          href: "/bookings?tab=config",
        },
        { id: "telegram", label: "Подключить Telegram", href: "/connections" },
      ];
    case "retail":
    case "food":
      return [
        { id: "catalog", label: "Заполнить каталог", href: "/orders" },
        { id: "orders", label: "Проверить приём заказов", href: "/orders" },
        { id: "telegram", label: "Подключить Telegram", href: "/connections" },
      ];
    case "automotive":
      return [
        {
          id: "services",
          label: "Услуги или работы",
          href: "/bookings?tab=config",
        },
        {
          id: "leads",
          label: "Настроить заявки",
          href: "/solutions/leads/setup",
        },
        { id: "telegram", label: "Подключить Telegram", href: "/connections" },
      ];
    case "construction":
    case "professional_services":
      return [
        {
          id: "leads",
          label: "Настроить заявки",
          href: "/solutions/leads/setup",
        },
        { id: "telegram", label: "Подключить Telegram", href: "/connections" },
        { id: "ai", label: "Заполнить AI-профиль", href: "/settings?section=ai" },
      ];
    default:
      return [
        { id: "industry", label: "Выбрать направление", href: "/onboarding" },
        { id: "solutions", label: "Посмотреть решения", href: "/solutions" },
        { id: "telegram", label: "Подключить Telegram", href: "/connections" },
        { id: "ai", label: "Заполнить AI-профиль", href: "/settings?section=ai" },
      ];
  }
}

export type SetupReadiness = {
  hasIndustry?: boolean;
  hasActiveSolution?: boolean;
  hasConnection?: boolean;
};

function readinessSteps(): ChecklistStep[] {
  return [
    {
      id: "industry",
      label: "Выбрать направление",
      href: "/onboarding",
    },
    {
      id: "solutions",
      label: "Подключить решение",
      href: "/solutions",
    },
    {
      id: "telegram",
      label: "Подключить площадку",
      href: "/settings?section=connections",
    },
  ];
}

export function SetupChecklist({
  businessId,
  progress,
  industry,
  onProgressChange,
  variant = "full",
  readiness,
}: {
  businessId: string;
  progress: Record<string, boolean>;
  industry?: string | null;
  onProgressChange?: (progress: Record<string, boolean>) => void;
  variant?: "full" | "compact";
  readiness?: SetupReadiness;
}) {
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState(progress);

  if (variant === "compact") {
    const derived = readinessSteps();
    const doneMap: Record<string, boolean> = {
      industry: !!(readiness?.hasIndustry || local.industry),
      solutions: !!(readiness?.hasActiveSolution || local.solutions),
      telegram: !!(readiness?.hasConnection || local.telegram),
    };
    const steps = derived.map((step) => ({
      ...step,
      done: doneMap[step.id] === true,
    }));
    const done = steps.filter((s) => s.done).length;
    const pct = steps.length ? Math.round((done / steps.length) * 100) : 0;
    if (pct >= 100) return null;
    return (
      <section className="setup-checklist setup-checklist--compact" aria-label="Чеклист настройки">
        <div className="setup-checklist__head">
          <h2 className="text-section-title">Старт за 3 шага</h2>
          <p className="text-body-sm">{pct}% · {done} из {steps.length}</p>
        </div>
        <SetupProgress steps={steps} done={done} />
        <ul className="setup-progress__list">
          {steps.map((step) => (
            <li key={step.id} className={step.done ? "is-done" : ""}>
              <Link href={step.href} className="text-link">
                {step.done ? "✓ " : ""}
                {step.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const steps = stepsForIndustry(industry).map((step) => ({
    ...step,
    done:
      local[step.id] === true ||
      (step.id === "industry" && local.industry === true),
  }));
  const done = steps.filter((s) => s.done).length;
  const pct = steps.length ? Math.round((done / steps.length) * 100) : 0;

  async function toggle(id: string, value: boolean) {
    setBusy(true);
    try {
      const next = { ...local, [id]: value };
      const allDone = stepsForIndustry(industry).every(
        (s) => next[s.id] === true || (s.id === "industry" && next.industry),
      );
      const saved = await apiRequest<{
        setup_progress: Record<string, boolean>;
      }>(`/api/v1/businesses/${businessId}/industry`, {
        method: "PATCH",
        body: JSON.stringify({
          setup_progress: next,
          ...(allDone ? { complete_onboarding: true } : {}),
        }),
      });
      setLocal(saved.setup_progress ?? next);
      onProgressChange?.(saved.setup_progress ?? next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel stack-md" aria-label="Чеклист настройки">
      <h2 className="text-section-title">Что ещё настроить</h2>
      <p className="text-body-sm">
        Настройка бизнеса — {pct}%. Отмечайте шаги по мере готовности.
      </p>
      <SetupProgress steps={steps} done={done} />
      <ul className="setup-progress__list">
        {steps.map((step) => (
          <li key={step.id} className={step.done ? "is-done" : ""}>
            <label className="capability-row">
              <input
                type="checkbox"
                checked={step.done}
                disabled={busy}
                onChange={(e) => void toggle(step.id, e.target.checked)}
              />
              <span>
                <Link href={step.href} className="text-link">
                  {step.label}
                </Link>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
