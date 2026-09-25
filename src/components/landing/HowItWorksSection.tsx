const STEPS = [
  { title: "Выбрал", hint: "Нужные решения" },
  { title: "Подключил", hint: "Telegram или VK" },
  { title: "Настроил", hint: "За пару шагов" },
  { title: "Работает", hint: "В одном кабинете" },
] as const;

export function HowItWorksSection() {
  return (
    <section className="landing-section landing-how" aria-labelledby="landing-how-title">
      <div className="landing-section__inner">
        <p className="landing-eyebrow">Как это работает</p>
        <h2 id="landing-how-title" className="landing-h2">
          Простой путь к порядку
        </h2>
        <span className="landing-gold-rule" aria-hidden="true" />
        <ol className="landing-how__track">
          {STEPS.map((step, index) => (
            <li key={step.title} className="landing-how__step">
              <span className="landing-how__index">{index + 1}</span>
              <strong>{step.title}</strong>
              <span>{step.hint}</span>
              {index < STEPS.length - 1 ? (
                <span className="landing-how__arrow" aria-hidden="true">
                  →
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
