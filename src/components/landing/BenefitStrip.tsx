function HexIcon({ kind }: { kind: "sales" | "tasks" | "team" }) {
  return (
    <svg className="landing-benefit__hex" viewBox="0 0 72 72" aria-hidden="true">
      <path
        className="landing-benefit__hex-stroke"
        d="M36 6.5 61 21v30L36 65.5 11 51V21L36 6.5z"
        fill="var(--landing-surface)"
        stroke="var(--landing-gold)"
        strokeWidth="2.2"
      />
      {kind === "sales" ? (
        <g fill="none" stroke="var(--landing-gold)" strokeWidth="2.2" strokeLinecap="round">
          <path d="M24 48V34M36 48V28M48 48V22" />
          <path d="M22 50h28" />
        </g>
      ) : null}
      {kind === "tasks" ? (
        <g fill="none" stroke="var(--landing-gold)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M26 36.5 32.5 43 48 27.5" />
          <path d="M24 24h24M24 48h24" opacity="0.35" />
        </g>
      ) : null}
      {kind === "team" ? (
        <g fill="none" stroke="var(--landing-gold)" strokeWidth="2.2" strokeLinecap="round">
          <circle cx="36" cy="28" r="6" />
          <circle cx="24" cy="42" r="4.5" />
          <circle cx="48" cy="42" r="4.5" />
          <path d="M28 50c0-4.4 3.6-8 8-8s8 3.6 8 8" />
        </g>
      ) : null}
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
