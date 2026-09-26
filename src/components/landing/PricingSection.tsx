import Link from "next/link";
import { PRODUCT_SOLUTIONS } from "@/lib/productSolutions";

export function PricingSection() {
  const paid = PRODUCT_SOLUTIONS.filter((s) => s.price > 0);
  const free = PRODUCT_SOLUTIONS.filter((s) => s.price === 0);

  return (
    <section
      className="landing-section landing-pricing"
      id="pricing"
      aria-labelledby="landing-pricing-title"
    >
      <div className="landing-section__inner">
        <p className="landing-eyebrow">Тарифы</p>
        <h2 id="landing-pricing-title" className="landing-h2">
          Прозрачные решения
        </h2>
        <span className="landing-gold-rule" aria-hidden="true" />
        <p className="landing-muted landing-pricing__intro">
          Платите только за нужные модули. Цены из продукта — без выдуманных пакетов.
        </p>
        <ul className="landing-pricing__list">
          {paid.map((solution) => (
            <li key={solution.code} className="landing-price-card">
              <h3>{solution.name}</h3>
              <p className="landing-price-card__value">
                {solution.price}&nbsp;₽<span>/мес.</span>
              </p>
            </li>
          ))}
          {free.map((solution) => (
            <li key={solution.code} className="landing-price-card landing-price-card--free">
              <h3>{solution.name}</h3>
              <p className="landing-price-card__value">
                0&nbsp;₽<span>/мес.</span>
              </p>
            </li>
          ))}
        </ul>
        <div className="landing-pricing__cta">
          <Link href="/register" className="landing-btn landing-btn--primary">
            Начать бесплатно
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
