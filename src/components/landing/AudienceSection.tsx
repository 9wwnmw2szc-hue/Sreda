const AUDIENCE = [
  "Услуги",
  "Салоны",
  "Мастера",
  "Магазины",
  "Студии",
  "Небольшие команды",
] as const;

export function AudienceSection() {
  return (
    <section className="landing-section landing-audience" aria-labelledby="landing-audience-title">
      <div className="landing-section__inner">
        <p className="landing-eyebrow">Для кого</p>
        <h2 id="landing-audience-title" className="landing-h2">
          Малый бизнес и команды
        </h2>
        <span className="landing-gold-rule" aria-hidden="true" />
        <ul className="landing-audience__cluster">
          {AUDIENCE.map((item) => (
            <li key={item} className="landing-audience__cell">
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
