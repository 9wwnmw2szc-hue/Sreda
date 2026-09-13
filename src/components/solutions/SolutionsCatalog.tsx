"use client";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Sparkles } from "lucide-react";
import { BusinessSwitcher } from "@/components/dashboard/BusinessSwitcher";
import { useCurrentBusiness } from "@/hooks/useCurrentBusiness";
import { isDemoMode } from "@/lib/dataMode";
import type { Solution } from "@/types";
export function SolutionsCatalog({ solutions }: { solutions: Solution[] }) {
  const { business, businesses, setBusinessId } = useCurrentBusiness();
  return (
    <div className="solutions-page">
      <div className="section-topline">
        <span className="eyebrow">Инструменты для вашего бизнеса</span>
        <BusinessSwitcher
          businesses={businesses}
          currentBusiness={business}
          onSelect={setBusinessId}
        />
      </div>
      <header className="solutions-intro">
        <div>
          <h1>Что поручим Среде?</h1>
          <p>
            Выберите задачу. Среда поможет с заявками, публикациями, продажами и
            записью.
          </p>
        </div>
        <span className="solutions-intro__symbol">
          <Sparkles size={32} />
        </span>
      </header>
      <p className="prototype-banner">
        {isDemoMode ? "Демонстрация: доступен предпросмотр настройки «Приёма заявок»." : "Настройте «Приём заявок» и подключите своего Telegram-бота. VK и оплата появятся отдельно."}
      </p>
      <div className="solution-catalog-grid">
        {solutions.map((solution) => (
          <article
            key={solution.id}
            className={`catalog-card catalog-card--${solution.code}`}
          >
            <div className="catalog-card__art">
              <Image
                src={`/assets/sreda/v2/module-${solution.code}.webp`}
                alt=""
                width={200}
                height={200}
                sizes="160px"
              />
            </div>
            <div className="catalog-card__body">
              <h2>{solution.name}</h2>
              <p>{solution.description}</p>
              <div className="catalog-card__price">
                <strong>{solution.price} ₽</strong>
                <span>/ месяц за решение</span>
              </div>
              {solution.code === "leads" ? (
                <Link
                  href="/solutions/leads/setup"
                  className="button button--primary"
                >
                  {isDemoMode ? "Посмотреть настройку" : "Настроить"}
                  <ArrowRight size={18} />
                </Link>
              ) : (
                <span className="catalog-soon">Скоро в Среде</span>
              )}
            </div>
          </article>
        ))}
      </div>
      <section className="catalog-explanation panel">
        <h2>Один бизнес. Несколько площадок.</h2>
        <p>
          Telegram и ВКонтакте будут работать с общими заявками. Управление — в
          одном рабочем пространстве Среды.
        </p>
      </section>
    </div>
  );
}
