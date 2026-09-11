import Link from "next/link";
import type { BillingInfo } from "@/types";
export function TariffCard({
  billing,
  activeSolutionsCount,
}: {
  billing: BillingInfo | null;
  activeSolutionsCount: number;
}) {
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
      {billing ? (
        <>
          <p className="tariff-card__price">
            {billing.pricePerMonth.toLocaleString("ru-RU")} ₽<span>/мес.</span>
          </p>
          {billing.status !== "active" && (
            <p className="tone-warning">
              {billing.status === "overdue"
                ? "Оплата просрочена"
                : "Подписка на паузе"}
            </p>
          )}
        </>
      ) : (
        <p className="empty-copy">Подписка пока не оформлена</p>
      )}
      <Link href="/billing" className="button button--outline button--full">
        Управлять подпиской
      </Link>
    </section>
  );
}
