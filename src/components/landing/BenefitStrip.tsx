function HexIcon({ kind }: { kind: "sales" | "tasks" | "team" }) {
  return (
    <svg className="landing-benefit__hex" viewBox="0 0 80 90" aria-hidden="true">
      <path d="M35 3a10 10 0 0 1 10 0l27 16a10 10 0 0 1 5 9v34a10 10 0 0 1-5 9L45 87a10 10 0 0 1-10 0L8 71a10 10 0 0 1-5-9V28a10 10 0 0 1 5-9Z" fill="none" stroke="#c9a544" strokeWidth="1" />
      {kind === "sales" ? <g fill="#cf9d27"><rect x="25" y="46" width="7" height="15" rx="1" /><rect x="37" y="37" width="7" height="24" rx="1" /><rect x="49" y="28" width="7" height="33" rx="1" /></g> : null}
      {kind === "tasks" ? <path d="m26 45 10 10 20-23" fill="none" stroke="#cf9d27" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" /> : null}
      {kind === "team" ? <g fill="#cf9d27"><circle cx="40" cy="35" r="7" /><circle cx="25" cy="39" r="5" /><circle cx="55" cy="39" r="5" /><path d="M30 61V52a10 10 0 0 1 20 0v9ZM19 57v-9a7 7 0 0 1 9-6l2 2a13 13 0 0 0-4 10v3ZM54 57v-3a13 13 0 0 0-4-10l2-2a7 7 0 0 1 9 6v9Z" /></g> : null}
    </svg>
  );
}

const ITEMS = [
  { kind: "sales" as const, title: "Продажи", subtitle: "Больше клиентов" },
  { kind: "tasks" as const, title: "Задачи", subtitle: "Выше эффективность" },
  { kind: "team" as const, title: "Команда", subtitle: "Сильнее вместе" },
];

export function BenefitStrip() {
  return (
    <section className="landing-benefits" aria-label="Преимущества">
      <ul className="landing-benefits__list">
        {ITEMS.map((item, index) => (
          <li key={item.title} className="landing-benefit">
            {index > 0 ? <span className="landing-benefit__divider" aria-hidden="true" /> : null}
            <HexIcon kind={item.kind} />
            <div className="landing-benefit__text">
              <strong>{item.title}</strong>
              <span>{item.subtitle}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
