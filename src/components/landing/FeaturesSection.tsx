import { PRODUCT_SOLUTIONS } from "@/lib/productSolutions";

const SHORT: Record<string, string> = {
  leads: "Заявки из Telegram и VK в одном потоке.",
  orders: "Каталог, остатки и заказы без хаоса.",
  booking: "Услуги, специалисты и свободные слоты.",
  admin_messages: "Диалоги с клиентами в едином inbox.",
  autopost: "Планирование постов без рутины.",
};

export function FeaturesSection() {
  return (
    <section
      className="landing-section landing-features"
      id="features"
      aria-labelledby="landing-features-title"
    >
      <div className="landing-section__inner">
        <p className="landing-eyebrow">Возможности</p>
        <h2 id="landing-features-title" className="landing-h2">
          Решения для работы
        </h2>
        <span className="landing-gold-rule" aria-hidden="true" />
        <ul className="landing-features__grid">
          {PRODUCT_SOLUTIONS.map((solution) => (
            <li key={solution.code} className="landing-feature">
              <span className="landing-feature__hex" aria-hidden="true" />
              <h3>{solution.name}</h3>
              <p>{SHORT[solution.code] ?? solution.description}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
