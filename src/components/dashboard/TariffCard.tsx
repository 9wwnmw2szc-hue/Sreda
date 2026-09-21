import Link from "next/link";
import type { BillingInfo } from "@/types";
export function TariffCard({
  billing,
  activeSolutionsCount,
}: {
  billing: BillingInfo | null;
  activeSolutionsCount: number;
}) {
  const estimate = billing?.pricePerMonth ?? 0;
  const paymentConnected = billing?.paymentConnected === true;
  return (
    <section className="panel tariff-card">
      <h2>Ваши решения</h2>
      <p className="tariff-card__count">
        {activeSolutionsCount}{" "}
        {activeSolutionsCount % 10 === 1 && activeSolutionsCount % 100 !== 11
          ? "активное решение"
          : activeSolutionsCount % 10 >= 2 &&
              activeSolutionsCount % 10 <= 4 &&
              !(
                activeSolutionsCount % 100 >= 12 &&
                activeSolutionsCount % 100 <= 14
              )
            ? "активных решения"
            : "активных решений"}
      </p>
      {activeSolutionsCount > 0 ? (
        <>
          <p className="tariff-card__price">
            {estimate.toLocaleString("ru-RU")} ₽
            <span>{paymentConnected ? "/мес." : "/мес. по каталогу"}</span>
          </p>
          {!paymentConnected && (
            <p className="empty-copy">
              {billing?.statusLabel ??
                "Оплата не подключена · списаний нет"}
            </p>
          )}
          {paymentConnected && billing?.status === "overdue" && (
            <p className="tone-warning">Оплата просрочена</p>
          )}
          {paymentConnected && billing?.status === "paused" && (
            <p className="tone-warning">Подписка на паузе</p>
          )}
        </>
      ) : (
        <p className="empty-copy">Подключите решения в каталоге</p>
      )}
      <Link href="/billing" className="button button--outline button--full">
        Тариф и оплата
      </Link>
    </section>
  );
}
