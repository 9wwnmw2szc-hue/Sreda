import Link from "next/link";
import { formatMoneyRub } from "@/lib/format";
import type { BillingInfo } from "@/types";

interface TariffCardProps {
  billing: BillingInfo | null;
  activeSolutionsCount: number;
}

export function TariffCard({ billing, activeSolutionsCount }: TariffCardProps) {
  const planName = billing?.planName ?? "Базовый";
  const price = billing?.pricePerMonth ?? 250;
  const count = billing?.activeSolutionsCount ?? activeSolutionsCount;
  const isActive = (billing?.status ?? "active") === "active";

  return (
    <section className="glass-panel flex min-h-[172px] w-full flex-col rounded-[22px] p-5 text-white">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-medium tracking-[0.08em] text-white/50 uppercase">
          Ваш тариф
        </p>
        <span className="inline-flex items-center gap-1.5 text-xs text-white/80">
          <span
            className={`h-2 w-2 rounded-full ${isActive ? "bg-[var(--success)]" : "bg-[var(--warning)]"}`}
            aria-hidden
          />
          {isActive ? "Активен" : "Пауза"}
        </span>
      </div>

      <h2 className="mt-3 text-[1.65rem] font-semibold tracking-tight">{planName}</h2>
      <p className="mt-1 text-sm text-white/65">{formatMoneyRub(price)}</p>
      <p className="mt-3 text-sm text-white/70">
        {count}{" "}
        {count === 1
          ? "активное решение"
          : count >= 2 && count <= 4
            ? "активных решения"
            : "активных решений"}
      </p>

      <Link
        href="/billing"
        className="mt-5 inline-flex w-full items-center justify-center rounded-[18px] bg-white/10 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/16 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50"
      >
        Управление тарифом
      </Link>
    </section>
  );
}
