"use client";
import Link from "next/link";
import {
  productSolutionByCode,
  type ProductSolutionCode,
} from "@/lib/productSolutions";

export function SolutionSetupBanner({
  code,
  title,
}: {
  code: ProductSolutionCode;
  title?: string;
}) {
  const def = productSolutionByCode(code);
  if (!def) return null;
  return (
    <section className="panel solution-setup-banner" aria-label="Следующие шаги">
      <h2>{title ?? `Настройка: ${def.name}`}</h2>
      <ol>
        {def.nextSteps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <div className="solution-setup-banner__actions">
        <Link className="button button--primary" href={def.setupPath}>
          Продолжить настройку
        </Link>
        <Link className="button button--ghost" href="/solutions">
          Все решения
        </Link>
      </div>
    </section>
  );
}

export function EmptyStateCta({
  title,
  description,
  href,
  action,
}: {
  title: string;
  description: string;
  href: string;
  action: string;
}) {
  return (
    <div className="empty-state empty-state--cta">
      <p>
        <strong>{title}</strong>
      </p>
      <p className="empty-copy">{description}</p>
      <Link className="button button--primary" href={href}>
        {action}
      </Link>
    </div>
  );
}
