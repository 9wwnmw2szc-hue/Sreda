"use client";

import Link from "next/link";
import { SetupProgress } from "@/components/ui/SetupChrome";

type ChecklistStep = {
  id: string;
  label: string;
  href: string;
};

function stepsForIndustry(industry?: string | null): ChecklistStep[] {
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
          label: "Добавить специалистов",
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
        { id: "services", label: "Услуги или работы", href: "/bookings?tab=config" },
        { id: "leads", label: "Настроить заявки", href: "/solutions/leads/setup" },
        { id: "telegram", label: "Подключить Telegram", href: "/connections" },
      ];
    case "construction":
    case "professional_services":
      return [
        { id: "leads", label: "Настроить заявки", href: "/solutions/leads/setup" },
        { id: "telegram", label: "Подключить Telegram", href: "/connections" },
        { id: "ai", label: "Заполнить AI-профиль", href: "/settings" },
      ];
    default:
      return [
        { id: "industry", label: "Выбрать направление", href: "/onboarding" },
        { id: "solutions", label: "Посмотреть решения", href: "/solutions" },
        { id: "telegram", label: "Подключить Telegram", href: "/connections" },
        { id: "ai", label: "Заполнить AI-профиль", href: "/settings" },
      ];
  }
}

export function SetupChecklist({
  businessId,
  progress,
  industry,
}: {
  businessId: string;
  progress: Record<string, boolean>;
  industry?: string | null;
}) {
  void businessId;
  const steps = stepsForIndustry(industry).map((step) => ({
    ...step,
    done: progress[step.id] === true || (step.id === "industry" && progress.industry === true),
  }));
  const done = steps.filter((s) => s.done).length;

  return (
    <section className="panel stack-md" aria-label="Чеклист настройки">
      <h2 className="text-section-title">Что ещё настроить</h2>
      <p className="text-body-sm">
        Отмечайте шаги по мере готовности — список зависит от направления
        бизнеса.
      </p>
      <SetupProgress steps={steps} done={done} />
      <ul className="setup-progress__list">
        {steps.map((step) => (
          <li key={step.id} className={step.done ? "is-done" : ""}>
            <Link href={step.href} className="text-link">
              {step.done ? "Готово: " : "Открыть: "}
              {step.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
