"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCurrentBusiness } from "@/hooks/useCurrentBusiness";
import {
  formatSolutionPrice,
  PRODUCT_SOLUTIONS,
  productSolutionByCode,
} from "@/lib/productSolutions";
import { solutionStatusLabel } from "@/lib/labels";
import { getBilling } from "@/services/billing.service";
import { getBusinessSolutions } from "@/services/solutions.service";
import type { BillingInfo, BusinessSolution, SolutionStatus } from "@/types";

type Line = {
  code: string;
  name: string;
  priceLabel: string;
  status: SolutionStatus;
  entitled: boolean;
};

export function BillingView() {
  const { businessId, business, isLoading: businessLoading } =
    useCurrentBusiness();
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (businessLoading || !business) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const [info, installed] = await Promise.all([
          getBilling(businessId),
          getBusinessSolutions(businessId),
        ]);
        if (cancelled) return;
        const byId = new Map(
          installed.map((item: BusinessSolution) => [item.solutionId, item]),
        );
        setLines(
          PRODUCT_SOLUTIONS.map((product) => {
            const row = byId.get(product.id);
            const status = (row?.status ?? "available") as SolutionStatus;
            const entitled =
              status === "active" ||
              status === "setup_required" ||
              status === "paused";
            return {
              code: product.code,
              name: product.name,
              priceLabel: formatSolutionPrice(
                product.price,
                product.messageLimit,
              ),
              status: row ? status : "available",
              entitled,
            };
          }),
        );
        setBilling(info);
        setError(null);
      } catch {
        if (!cancelled)
          setError("Не удалось загрузить тариф. Попробуйте ещё раз.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [businessId, business, businessLoading]);

  const entitled = lines.filter((line) => line.entitled);
  const estimate =
    billing?.pricePerMonth ??
    entitled.reduce((sum, line) => {
      const product = productSolutionByCode(line.code);
      return sum + (product?.price ?? 0);
    }, 0);

  return (
    <div className="billing-page">
      <header className="panel-heading billing-page__header">
        <div>
          <h1>Тариф и оплата</h1>
          <p className="empty-copy">
            Активные решения и оценка стоимости по каталогу. Оплата ещё не
            подключена — списаний нет.
          </p>
        </div>
      </header>

      {loading || businessLoading ? (
        <section className="panel">
          <p className="empty-copy">Загружаем тариф…</p>
        </section>
      ) : error ? (
        <section className="panel">
          <p className="tone-warning">{error}</p>
        </section>
      ) : (
        <>
          <section className="panel billing-summary">
            <h2>Сводка</h2>
            <p className="tariff-card__count">
              {entitled.length}{" "}
              {entitled.length % 10 === 1 && entitled.length % 100 !== 11
                ? "активное решение"
                : entitled.length % 10 >= 2 &&
                    entitled.length % 10 <= 4 &&
                    !(entitled.length % 100 >= 12 && entitled.length % 100 <= 14)
                  ? "активных решения"
                  : "активных решений"}
            </p>
            <p className="tariff-card__price">
              {estimate.toLocaleString("ru-RU")} ₽<span>/мес. по каталогу</span>
            </p>
            <p className="billing-summary__status">
              {billing?.statusLabel ??
                (entitled.length > 0
                  ? "Решения подключены · оплата не подключена"
                  : "Решения не подключены · оплата не подключена")}
            </p>
            <p className="account-footnote">
              {billing?.nextStep ?? "Подключение оплаты — следующий шаг"}
            </p>
            <Link href="/solutions" className="button button--outline">
              К решениям
            </Link>
          </section>

          <section className="panel">
            <h2>Решения и цены</h2>
            <ul className="billing-lines">
              {lines.map((line) => (
                <li key={line.code} className="billing-lines__item">
                  <div>
                    <strong>{line.name}</strong>
                    <span className="billing-lines__meta">
                      {line.entitled
                        ? solutionStatusLabel(
                            line.status === "available" ? "active" : line.status,
                          )
                        : "Не подключено"}
                    </span>
                  </div>
                  <span className="billing-lines__price">{line.priceLabel}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
